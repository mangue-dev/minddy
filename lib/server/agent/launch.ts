import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectLink } from "@/lib/server/git/repo-links";
import { insertEvents } from "@/lib/server/issue-events";
import { resolveAgentModel } from "./model";
import { checkAgentQuota, type AgentQuota } from "./quota";
import { createRun, activeRunForIssue, type AgentRun } from "./runs";
import { drainAgentRuns } from "./drain";
import { chainAgentDrain } from "./drain-chain";

/**
 * Point d'entrée UNIQUE pour démarrer un run d'agent (MIN-46). Appelé par TOUS
 * les triggers (bouton, chat numo via tool call, @numo en commentaire). Résout et
 * FIGE le modèle sur le run (cascade run > user > racine), fait les pré-checks
 * (dépôt lié, quota/BYOK, pas de run déjà actif), crée le run `queued`, puis kicke
 * le drain en `after()` (réponse immédiate à l'utilisateur).
 */

export type LaunchError =
  | "issueNotFound"
  | "noRepo"
  | "unsupportedProvider"
  | "alreadyRunning"
  | "quotaExceeded";

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
  /**
   * Reprise d'une branche existante (demande de changements sur une PR) : le run
   * repart de cette branche au lieu d'en créer une neuve → met à jour la MÊME PR.
   */
  branchName?: string | null;
  baseBranch?: string | null;
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

  const model = await resolveAgentModel({ perRunModel: input.model, userId: input.userId });

  const run = await createRun({
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
    branchName: input.branchName ?? null,
    baseBranch: input.baseBranch ?? null,
  });

  // Trace dans le journal d'activité de l'issue : qui a lancé l'agent + le modèle.
  await insertEvents(service, [
    {
      issue_id: input.issueId,
      actor_id: input.userId,
      type: "agent_launched",
      to_value: model,
    },
  ]);

  kickAgentDrain(service);
  return { ok: true, run };
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
