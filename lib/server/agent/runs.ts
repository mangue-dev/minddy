import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getServiceClient } from "@/lib/supabase-service";
import type { AgentChatMessage, AgentEventType } from "./agent-loop";

/**
 * Accès données des runs de l'agent de code (MIN-46) : création, claim CAS,
 * stamping terminal-gardé, sweeper des runs bloqués, et append des events du
 * live view. Service client uniquement (RLS lecture-seule côté membres).
 */

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "needs_input";

/** Contenu sérialisé du checkpoint (repris tel quel au chunk suivant). */
export interface AgentCheckpoint {
  messages: AgentChatMessage[];
  /** Prochain index de ligne ai_usage (ordre d'affichage). */
  usageSeq?: number;
}

export interface AgentRun {
  id: string;
  project_id: string;
  issue_id: string;
  repo_link_id: string | null;
  connection_id: string | null;
  status: AgentRunStatus;
  triggered_by: "button" | "chat" | "mention";
  created_by: string | null;
  prompt: string | null;
  model: string | null;
  model_forced: boolean;
  key_mode: "platform" | "byok";
  base_branch: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  sandbox_id: string | null;
  checkpoint: AgentCheckpoint | null;
  continuations: number;
  attempts: number;
  not_before: string;
  started_at: string | null;
  window_started_at: string | null;
  run_id: string | null;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

const ACTIVE_STATUSES: AgentRunStatus[] = ["queued", "running", "needs_input"];
/** Un run 'running' plus vieux que ce seuil est présumé bloqué (fonction morte).
    Un chunk sain dure ≤ ~270s ; 6 min laisse une marge sûre tout en récupérant
    vite un vrai crash (au lieu d'attendre 10 min). */
const STUCK_RUNNING_MS = 6 * 60_000;
const MAX_CRASH_ATTEMPTS = 2;

export interface CreateRunInput {
  projectId: string;
  issueId: string;
  repoLinkId: string | null;
  connectionId: string | null;
  createdBy: string;
  prompt?: string | null;
  model: string;
  modelForced: boolean;
  keyMode: "platform" | "byok";
  triggeredBy: "button" | "chat" | "mention";
  /**
   * Branche à reprendre (au lieu d'en générer une neuve) : la « demande de
   * changements » sur une PR relance Numo sur SA branche → même PR mise à jour.
   */
  baseBranch?: string | null;
  branchName?: string | null;
}

/** Crée un run en `queued`, prêt à être drainé. */
export async function createRun(input: CreateRunInput): Promise<AgentRun> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_runs")
    .insert({
      project_id: input.projectId,
      issue_id: input.issueId,
      repo_link_id: input.repoLinkId,
      connection_id: input.connectionId,
      status: "queued",
      triggered_by: input.triggeredBy,
      created_by: input.createdBy,
      prompt: input.prompt ?? null,
      model: input.model,
      model_forced: input.modelForced,
      key_mode: input.keyMode,
      base_branch: input.baseBranch ?? null,
      branch_name: input.branchName ?? null,
      run_id: randomUUID(),
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create agent run");
  }
  return data as AgentRun;
}

/** Claim CAS atomique (queued → running). Renvoie null si un autre l'a pris. */
export async function claimRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("claim_agent_run", { p_run_id: runId });
  if (error) {
    console.error("[agent-runs] claim failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as AgentRun[];
  return rows[0] ?? null;
}

export async function getRun(runId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service.from("agent_runs").select("*").eq("id", runId).maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/** Run actif (queued/running/needs_input) de l'issue, ou null. */
export async function activeRunForIssue(issueId: string): Promise<AgentRun | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("*")
    .eq("issue_id", issueId)
    .in("status", ACTIVE_STATUSES)
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

export interface StampFields {
  status?: AgentRunStatus;
  checkpoint?: AgentCheckpoint | null;
  continuations?: number;
  attempts?: number;
  not_before?: string;
  sandbox_id?: string | null;
  base_branch?: string | null;
  branch_name?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  pr_state?: AgentRun["pr_state"];
  cost_usd?: number;
  outcome?: string | null;
  error_message?: string | null;
  window_started_at?: string | null;
}

/**
 * Met à jour un run en gardant la transition (`.in('status', guard)`, défaut
 * ['running']) : un run annulé/déjà terminé n'est jamais réécrit par un chunk en
 * retard. Renvoie le run mis à jour, ou null si la garde n'a pas matché.
 */
export async function stampRun(
  runId: string,
  fields: StampFields,
  opts?: { guard?: AgentRunStatus[] },
): Promise<AgentRun | null> {
  const service = getServiceClient();
  const guard = opts?.guard ?? ["running"];
  const { data } = await service
    .from("agent_runs")
    .update(fields)
    .eq("id", runId)
    .in("status", guard)
    .select("*")
    .maybeSingle();
  return (data as AgentRun | null) ?? null;
}

/**
 * Récupère les runs `running` bloqués (fonction morte : started_at trop vieux) :
 * requeue tant qu'il reste des tentatives, sinon échoue. À appeler en tête de
 * chaque drain (filet ultime, comme AutoKap).
 */
export async function requeueStuckRuns(service: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_RUNNING_MS).toISOString();
  const { data } = await service
    .from("agent_runs")
    .select("id, attempts")
    .eq("status", "running")
    .lt("started_at", cutoff);
  const rows = (data ?? []) as Array<{ id: string; attempts: number }>;
  for (const row of rows) {
    if (row.attempts < MAX_CRASH_ATTEMPTS) {
      await service
        .from("agent_runs")
        .update({ status: "queued", not_before: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "running");
    } else {
      await service
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: "Agent run stuck (exceeded max attempts)",
          checkpoint: null,
        })
        .eq("id", row.id)
        .eq("status", "running");
    }
  }
}

/**
 * Synchronise l'état PR des runs qui ont ouvert la PR `prNumber` sur le dépôt
 * `repoFullName` (appelé par le webhook GitHub). Un numéro de PR est unique dans
 * un dépôt ; plusieurs projets peuvent lier le même dépôt, d'où le filtre par les
 * liaisons de ce dépôt. Best-effort.
 */
export async function syncPrState(opts: {
  repoFullName: string;
  prNumber: number;
  prState: AgentRun["pr_state"];
  prUrl?: string | null;
}): Promise<void> {
  const service = getServiceClient();
  const { data: links } = await service
    .from("project_git_links")
    .select("id")
    .eq("repo_full_name", opts.repoFullName);
  const linkIds = ((links ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (linkIds.length === 0) return;
  const update: Record<string, unknown> = { pr_state: opts.prState };
  if (opts.prUrl) update.pr_url = opts.prUrl;
  await service
    .from("agent_runs")
    .update(update)
    .eq("pr_number", opts.prNumber)
    .in("repo_link_id", linkIds);
}

/** Met à jour l'état PR d'un run précis (action de review in-app : merge/close). */
export async function setRunPrState(
  runId: string,
  prState: AgentRun["pr_state"],
): Promise<void> {
  const service = getServiceClient();
  await service.from("agent_runs").update({ pr_state: prState }).eq("id", runId);
}

/**
 * Ajoute un event au flux du live view (seq monotone par run). Best-effort : le
 * suivi ne doit jamais faire échouer le run. Un run n'a qu'UN écrivain à la fois
 * (le claimer), donc le max(seq)+1 est sûr.
 */
export async function appendEvent(
  runId: string,
  type: AgentEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("agent_run_events")
      .select("seq")
      .eq("run_id", runId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextSeq = ((data as { seq: number } | null)?.seq ?? -1) + 1;
    await service.from("agent_run_events").insert({ run_id: runId, seq: nextSeq, type, payload });
  } catch (err) {
    console.error("[agent-runs] appendEvent failed:", (err as Error).message);
  }
}
