import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { insertEvents } from "@/lib/server/issue-events";
import { resolveAgentModel, AgentModelRequiredError } from "./model";
import { checkAgentQuota, type AgentQuota } from "./quota";
import {
  createRun,
  activeRunForIssue,
  inheritableWorkForIssue,
  insertRunMessage,
  bumpRunActivity,
  ActiveRunExistsError,
  type AgentRun,
} from "./runs";
import { drainAgentRuns } from "./drain";
import { chainAgentDrain } from "./drain-chain";
import { syncIssueStatusOnAgentStart } from "./issue-status-sync";

/**
 * Point d'entrée UNIQUE pour démarrer un run FROID (MIN-46 + MIN-68). Appelé par
 * tous les triggers de LANCEMENT (sidebar, clic droit, « demander des changements »,
 * chat numo). Résout et FIGE le modèle sur le run (cascade run > user > racine), fait
 * les pré-checks (dépôt lié, quota/BYOK, pas de run déjà actif), fait HÉRITER la PR
 * de l'issue si elle est encore pertinente, crée le run `queued`, puis kicke le drain
 * en `after()` (réponse immédiate à l'utilisateur).
 *
 * Froid = une run NEUVE : aucun checkpoint, aucun message LLM repris. Elle hérite
 * seulement de l'ARTEFACT (branche + PR) et du résumé de la run précédente, injectés
 * dans son prompt d'amorce par `execute.ts`. La reprise à CHAUD (même session, même
 * contexte) est un chemin distinct : `/steer`, depuis le composer d'une conversation.
 */

export type LaunchError =
  | "issueNotFound"
  | "noRepo"
  | "unsupportedProvider"
  | "alreadyRunning"
  | "quotaExceeded"
  | "noModelForProvider";

export type LaunchResult =
  | { ok: true; run: AgentRun }
  | { ok: false; error: LaunchError; run?: AgentRun; quota?: AgentQuota };

export interface LaunchAgentInput {
  issueId: string;
  userId: string;
  triggeredBy: "button" | "chat" | "mention";
  /** Consigne libre en plus de l'issue (optionnelle). */
  prompt?: string | null;
  /** Modèle explicite = override/forçage (numo ou l'utilisateur). */
  model?: string | null;
  /** true si le modèle est imposé (numo « utilise tel modèle »). */
  forced?: boolean;
}

export async function launchAgentRun(input: LaunchAgentInput): Promise<LaunchResult> {
  const service = getServiceClient();

  const { data: issue } = await service
    .from("issues")
    .select("id, project_id")
    .eq("id", input.issueId)
    .maybeSingle();
  if (!issue) return { ok: false, error: "issueNotFound" };
  const projectId = (issue as { project_id: string }).project_id;

  const link = await getProjectLink(projectId);
  if (!link) return { ok: false, error: "noRepo" };
  if (link.provider !== "github") return { ok: false, error: "unsupportedProvider" };

  const active = await activeRunForIssue(input.issueId);
  if (active) return { ok: false, error: "alreadyRunning", run: active };

  const quota = await checkAgentQuota(input.userId);
  if (!quota.allowed) return { ok: false, error: "quotaExceeded", quota };

  let model: string;
  try {
    model = await resolveAgentModel({ perRunModel: input.model, userId: input.userId });
  } catch (err) {
    if (err instanceof AgentModelRequiredError) {
      return { ok: false, error: "noModelForProvider" };
    }
    throw err;
  }

  // Héritage du TRAVAIL (MIN-68, indexé sur la branche) : tant que la lignée de
  // l'issue est vivante (branche portée par une run, PR non mergée — ou pas de PR
  // du tout), la run froide repart de SA branche et porte ses `pr_*` dès la
  // création → `execute.ts` pousse sur la bonne branche et met à jour la MÊME PR
  // le cas échéant (une `closed` est rouverte au push). Après un merge, plus rien
  // à hériter : branche neuve.
  const inherited = await inheritableWorkForIssue(input.issueId);

  let run: AgentRun;
  try {
    run = await createRun({
      projectId,
      issueId: input.issueId,
      repoLinkId: link.id,
      connectionId: link.connection_id,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      model,
      modelForced: !!input.forced,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      branchName: inherited?.branchName ?? null,
      baseBranch: inherited?.baseBranch ?? null,
      prNumber: inherited?.prNumber ?? null,
      prUrl: inherited?.prUrl ?? null,
      prState: inherited?.prState ?? null,
    });
  } catch (err) {
    // Course perdue contre un lancement concurrent (double-clic, deux onglets) :
    // l'index unique a tranché. Même réponse que le pré-check, pas un 500.
    if (err instanceof ActiveRunExistsError) {
      const winner = await activeRunForIssue(input.issueId);
      return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
    }
    throw err;
  }

  // Trace dans le journal d'activité de l'issue : qui a lancé l'agent + le modèle.
  await insertEvents(service, [
    {
      issue_id: input.issueId,
      actor_id: input.userId,
      type: "agent_launched",
      to_value: model,
    },
  ]);

  // Agent lancé → l'issue passe « en cours » (MIN-46). Exception : la run hérite
  // d'une PR encore en revue (open/draft) — c'est SON état qui gouverne le statut
  // (in_review), on ne le fait pas régresser le temps d'une itération. Une PR
  // refusée (closed → issue `todo`) repasse bien « en cours ».
  if (inherited?.prState !== "open" && inherited?.prState !== "draft") {
    await syncIssueStatusOnAgentStart({ issueId: input.issueId, actorId: input.userId });
  }

  kickAgentDrain(service);
  return { ok: true, run };
}

export type ContinueResult =
  | { ok: true; run: AgentRun; continued: boolean }
  | { ok: false; error: LaunchError; run?: AgentRun; quota?: AgentQuota };

/**
 * Démarre OU CONTINUE un run d'agent, pour les triggers CONVERSATIONNELS où « une
 * run tourne déjà » ne doit pas être une erreur (@numo en commentaire, chat numo) :
 *   • une run TRAVAILLE (queued/running) → le message lui parvient en STEERING, à
 *     chaud, drainé à la frontière de round ;
 *   • sinon (aucune run, ou la dernière est au repos) → nouvelle run FROIDE, qui
 *     hérite de la PR de l'issue.
 * Une run `completed` (au repos) n'est pas reprise ici : la reprise à chaud d'une
 * conversation existante se fait depuis le composer de SA conversation (`/steer`).
 */
export async function continueOrLaunchAgentRun(
  input: LaunchAgentInput,
): Promise<ContinueResult> {
  const active = await activeRunForIssue(input.issueId);
  if (active) {
    const text = (input.prompt ?? "").trim();
    if (text) await insertRunMessage(active.id, input.userId, text);
    await bumpRunActivity(active.id);
    return { ok: true, run: active, continued: true };
  }
  const result = await launchAgentRun(input);
  return result.ok ? { ok: true, run: result.run, continued: false } : result;
}

/**
 * Kick basse latence : draine après la réponse HTTP (même invocation), puis
 * auto-invoque si du travail reste. Ne lève jamais — le cron (toutes les 2 min) est le filet.
 */
export function kickAgentDrain(service: SupabaseClient): void {
  after(async () => {
    try {
      const summary = await drainAgentRuns(service);
      if (summary.claimed > 0) await chainAgentDrain({ supabase: service, chain: 0 });
    } catch (err) {
      console.error("[agent-launch] kick drain failed:", (err as Error).message);
    }
  });
}
