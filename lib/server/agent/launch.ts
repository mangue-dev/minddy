import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { REPO_PROVIDERS, isRepoProviderId } from "@/lib/repo-providers";
import { insertEvents } from "@/lib/server/issue-events";
import { resolveAgentModel, resolveReasoningLevel, AgentModelRequiredError } from "./model";
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
  | "noModelForProvider"
  | "promptRequired";

export type LaunchResult =
  | { ok: true; run: AgentRun }
  | { ok: false; error: LaunchError; run?: AgentRun; quota?: AgentQuota };

export interface LaunchAgentInput {
  /**
   * Ticket d'ancrage. ABSENT → run CARNET (MIN-84) : l'agent est découplé du
   * système de tickets — `projectId` (le dépôt à cloner) et `prompt` (la note,
   * son instruction) sont alors requis. Un run carnet n'a ni lignée ni héritage :
   * chaque lancement est une conversation autonome.
   */
  issueId?: string | null;
  /** Projet du run carnet. Ignoré quand `issueId` est fourni (le projet vient du
   *  ticket). L'appelant a déjà vérifié l'appartenance au projet. */
  projectId?: string | null;
  userId: string;
  triggeredBy: "button" | "chat" | "mention";
  /** Consigne libre en plus de l'issue (optionnelle) — ou LA note (run carnet). */
  prompt?: string | null;
  /** Modèle explicite = override/forçage (numo ou l'utilisateur). */
  model?: string | null;
  /** true si le modèle est imposé (numo « utilise tel modèle »). */
  forced?: boolean;
  /**
   * Niveau de raisonnement choisi au lancement (MIN-122). Absent → le défaut perso
   * de l'utilisateur, sinon `off`. Borné à `medium` en quota minddy.
   */
  reasoningLevel?: string | null;
  /**
   * Branche de base choisie au lancement (défaut : la branche par défaut du
   * dépôt). IGNORÉE si l'issue a une lignée vivante à hériter : la branche de
   * travail existe déjà, sa base ne se rechoisit pas.
   */
  baseBranch?: string | null;
  /**
   * Ce qu'on demande à l'agent, du point de vue du TICKET. Seul `implement`
   * (le défaut) fait passer le ticket « en cours » ; `plan` (« Générer un
   * plan » / « Vérifier le plan ») le CADRE sans le commencer, et `verify`
   * (« Vérifier l'implémentation ») CONTRÔLE du travail déjà fait — un ticket
   * en revue doit y rester, pas régresser « en cours ».
   */
  intent?: AgentLaunchIntent;
}

/** Ce que le lancement fait au statut du ticket : cf. `intentStartsWork`. */
export type AgentLaunchIntent = "implement" | "plan" | "verify";

/**
 * Le lancement fait-il DÉMARRER le ticket ? Seul « implémenter » est du travail
 * neuf ; cadrer vient avant, vérifier vient après — ni l'un ni l'autre ne doit
 * déplacer le ticket. `undefined` (appelant historique) vaut « implémenter ».
 */
export function intentStartsWork(intent: AgentLaunchIntent | undefined): boolean {
  return intent !== "plan" && intent !== "verify";
}

export async function launchAgentRun(input: LaunchAgentInput): Promise<LaunchResult> {
  const service = getServiceClient();

  const issueId = input.issueId ?? null;
  let projectId: string;
  if (issueId) {
    const { data: issue } = await service
      .from("issues")
      .select("id, project_id")
      .eq("id", issueId)
      .maybeSingle();
    if (!issue) return { ok: false, error: "issueNotFound" };
    projectId = (issue as { project_id: string }).project_id;
  } else {
    // Run CARNET : sans ticket, la note EST la mission — un run carnet sans
    // instruction n'aurait rien à faire (un run d'issue, si : le ticket).
    if (!input.projectId) return { ok: false, error: "issueNotFound" };
    if (!input.prompt?.trim()) return { ok: false, error: "promptRequired" };
    projectId = input.projectId;
  }

  const link = await getProjectLink(projectId);
  if (!link) return { ok: false, error: "noRepo" };
  // Le registre des providers fait autorité (MIN-69) : un provider connu avec la
  // capacité d'écriture (PR/MR) peut porter l'agent — github ET gitlab.
  if (!isRepoProviderId(link.provider) || !REPO_PROVIDERS[link.provider].capabilities.write) {
    return { ok: false, error: "unsupportedProvider" };
  }

  // « Un seul agent actif par ticket » est une règle du TICKET : les runs carnet,
  // indépendants les uns des autres, peuvent travailler en parallèle (chacun sur
  // sa branche). Le quota reste leur seul plafond.
  if (issueId) {
    const active = await activeRunForIssue(issueId);
    if (active) return { ok: false, error: "alreadyRunning", run: active };
  }

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

  // Niveau de raisonnement figé sur le run, comme le modèle : les chunks suivants
  // tournent dans d'autres invocations et doivent retrouver le même.
  const reasoningLevel = await resolveReasoningLevel({
    perRunLevel: input.reasoningLevel,
    userId: input.userId,
  });

  // Héritage du TRAVAIL (MIN-68, indexé sur la branche) : tant que la lignée de
  // l'issue est vivante (branche portée par une run, PR non mergée — ou pas de PR
  // du tout), la run froide repart de SA branche et porte ses `pr_*` dès la
  // création → `execute.ts` pousse sur la bonne branche et met à jour la MÊME PR
  // le cas échéant (une `closed` est rouverte au push). Après un merge, plus rien
  // à hériter : branche neuve.
  // Un run carnet n'hérite jamais : pas de lignée, branche neuve à chaque fois.
  const inherited = issueId ? await inheritableWorkForIssue(issueId) : null;

  let run: AgentRun;
  try {
    run = await createRun({
      projectId,
      issueId,
      repoLinkId: link.id,
      connectionId: link.connection_id,
      createdBy: input.userId,
      prompt: input.prompt ?? null,
      model,
      modelForced: !!input.forced,
      reasoningLevel,
      keyMode: quota.mode,
      triggeredBy: input.triggeredBy,
      branchName: inherited?.branchName ?? null,
      baseBranch: inherited ? inherited.baseBranch : input.baseBranch ?? null,
      prNumber: inherited?.prNumber ?? null,
      prUrl: inherited?.prUrl ?? null,
      prState: inherited?.prState ?? null,
    });
  } catch (err) {
    // Course perdue contre un lancement concurrent (double-clic, deux onglets) :
    // l'index unique a tranché. Même réponse que le pré-check, pas un 500.
    // (Inatteignable pour un run carnet : les NULL sont distincts dans l'index.)
    if (err instanceof ActiveRunExistsError && issueId) {
      const winner = await activeRunForIssue(issueId);
      return { ok: false, error: "alreadyRunning", run: winner ?? undefined };
    }
    throw err;
  }

  if (issueId) {
    // Trace dans le journal d'activité de l'issue : qui a lancé l'agent + le modèle.
    await insertEvents(service, [
      {
        issue_id: issueId,
        actor_id: input.userId,
        type: "agent_launched",
        to_value: model,
      },
    ]);

    // Agent lancé → l'issue passe « en cours » (MIN-46). Deux exceptions :
    //  • run qui n'est pas du travail neuf (`intent` `plan` ou `verify` — cadrer
    //    avant, contrôler après) : le ticket garde son statut, quel qu'il soit ;
    //  • la run hérite d'une PR encore en revue (open/draft) — c'est SON état qui
    //    gouverne le statut (in_review), on ne le fait pas régresser le temps d'une
    //    itération. Une PR refusée (closed → issue `todo`) repasse bien « en cours ».
    if (
      intentStartsWork(input.intent) &&
      inherited?.prState !== "open" &&
      inherited?.prState !== "draft"
    ) {
      await syncIssueStatusOnAgentStart({ issueId, actorId: input.userId });
    }
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
  // Chemin conversationnel d'ISSUE uniquement (@numo, chat) : un run carnet se
  // reprend par SA conversation (/steer), jamais par ce raccourci.
  const active = input.issueId ? await activeRunForIssue(input.issueId) : null;
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
