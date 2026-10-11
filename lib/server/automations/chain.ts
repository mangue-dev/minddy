import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import type { AgentRunVerdict } from "@/lib/server/agent/runs";
import { decodeAgentVerdict, legacyAgentVerdictSchema,
  type StoredAgentVerdict } from "@/lib/server/agent/run-verdict-content";
import { hydrateNumoTurn, type NumoAutomationContext,
  type NumoTurn } from "@/lib/server/numo/turns";
import { decodeOperationJson, decodeOperationText } from "./operation-content";

/** Read-only archive access. Retired chains cannot launch or advance work. */

export type AgentChainStatus =
  /** SUSPENDED: open, but it only starts at `not_before` — and only
 * if the condition which opened it still holds (see migration). */
  | "pending"
  | "running"
  | "awaiting_human"
  | "stopped"
  | "completed"
  | "failed";

/** The event put aside by a suspended channel, replayed when he wakes up. */
export interface PendingChainEvent {
  to: string;
  source: string;
}

export interface AgentChain {
  id: string;
  project_id: string;
  issue_id: string;
  owner_id: string;
  preset: string | null;
  status: AgentChainStatus;
  step: number;
  played_rule_ids: string[];
  retries: number;
  spent_usd: number;
  /** LEGACY: never posed again. A chain is no longer interrupted on a ceiling —
 * only the account quota limits the expenditure (see the lib/automations header).
 * The column remains so as not to migrate a table for a dead field. */
  budget_usd: number | null;
  stop_reason: string | null;
  /** Start time of a suspended chain. Null = it has already started. */
  not_before: string | null;
  /** The event which opened it, to be replayed when you wake up (channel on hold). */
  pending_event: PendingChainEvent | null;
  created_at: string;
  updated_at: string;
}

export interface NumoAutomationOperation {
  id: string;
  chain_id: string;
  step: number;
  rule_id: string;
  mode: NumoAutomationContext["mode"];
  conversation_id: string;
  request_id: string;
  turn_id: string | null;
  prompt: string;
  locale: string;
  context: NumoAutomationContext;
  outcome: "ok" | "failed" | null;
  outcome_summary: string | null;
  outcome_blockers: string[];
  created_at: string;
  updated_at: string;
}

export interface NumoAutomationOperationState {
  operation: NumoAutomationOperation;
  turn: NumoTurn | null;
}

async function hydrateOperation(row: NumoAutomationOperation,
  projectId: string): Promise<NumoAutomationOperation> {
  const [prompt, context, outcomeSummary, outcomeBlockers] = await Promise.all([
    decodeOperationText(projectId, row.chain_id, row.step, "prompt", row.prompt),
    decodeOperationJson(projectId, row.chain_id, row.step, "context",
      row.context as unknown as Record<string, unknown>),
    decodeOperationText(projectId, row.chain_id, row.step, "outcome_summary",
      row.outcome_summary),
    decodeOperationJson(projectId, row.chain_id, row.step, "outcome_blockers",
      row.outcome_blockers as unknown as unknown[]),
  ]);
  return { ...row, prompt: prompt ?? "",
    context: context as unknown as NumoAutomationContext,
    outcome_summary: outcomeSummary,
    outcome_blockers: outcomeBlockers as string[] };
}

async function operationProjectId(chainId: string) {
  const { data, error } = await getServiceClient().from("agent_chains")
    .select("project_id").eq("id", chainId).maybeSingle();
  if (error || !data?.project_id) throw new Error("Automation operation project is unavailable");
  return data.project_id as string;
}

/**
 * Statuses of a LIVE chain — those covered by the unique index per ticket.
 * `pending` is one of them: a suspended ticket is BUSY, otherwise a second chain would open on it and both would start.
 */
export const LIVE_CHAIN_STATUSES: AgentChainStatus[] = [
  "pending",
  "running",
  "awaiting_human",
];



function toChain(row: unknown): AgentChain {
  const chain = row as AgentChain;
  return {
    ...chain,
    // `numeric` returns to string via PostgREST as soon as it exceeds the precision
    // a double — we normalize here, once, rather than for each reader.
    spent_usd: Number(chain.spent_usd ?? 0),
    budget_usd: chain.budget_usd == null ? null : Number(chain.budget_usd),
    played_rule_ids: Array.isArray(chain.played_rule_ids) ? chain.played_rule_ids : [],
  };
}

/** The LIVE string of a ticket, or null. */
export async function chainForIssue(issueId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("issue_id", issueId)
    .in("status", LIVE_CHAIN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** The LAST string of a ticket, alive or not (screen reading). */
export async function latestChainForIssue(issueId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toChain(data) : null;
}

export async function getChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("id", chainId)
    .maybeSingle();
  return data ? toChain(data) : null;
}

export async function lastNumoAutomationOperation(
  chainId: string,
): Promise<NumoAutomationOperationState | null> {
  const service = getServiceClient();
  const { data: operation, error } = await service
    .from("numo_automation_operations")
    .select("*")
    .eq("chain_id", chainId)
    .order("step", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!operation) return null;
  const readable = await hydrateOperation(operation as NumoAutomationOperation,
    await operationProjectId(chainId));
  if (!operation.turn_id) {
    return { operation: readable, turn: null };
  }
  const { data: turn, error: turnError } = await service
    .from("numo_assistant_turns")
    .select("*")
    .eq("id", operation.turn_id)
    .maybeSingle();
  if (turnError) throw new Error(turnError.message);
  return {
    operation: readable,
    turn: turn ? await hydrateNumoTurn(turn as NumoTurn) : null,
  };
}

export async function numoAutomationOperationForTurn(
  turnId: string,
): Promise<NumoAutomationOperation | null> {
  const { data, error } = await getServiceClient()
    .from("numo_automation_operations")
    .select("*")
    .eq("turn_id", turnId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? hydrateOperation(data as NumoAutomationOperation,
    await operationProjectId(data.chain_id)) : null;
}

/** Decode the most recent historical verdict without advancing the chain. */
export async function lastVerdictOfChain(chainId: string): Promise<AgentRunVerdict | null> {
  const service = getServiceClient();
  const { data: operation, error: operationError } = await service
    .from("numo_automation_operations")
    .select("step, mode, outcome, outcome_summary, outcome_blockers")
    .eq("chain_id", chainId)
    .in("mode", ["plan", "verify"])
    .not("outcome", "is", null)
    .order("step", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (operationError) throw new Error(operationError.message);
  if (operation?.outcome) {
    const projectId = await operationProjectId(chainId);
    const [summary, blockers] = await Promise.all([
      decodeOperationText(projectId, chainId, operation.step,
        "outcome_summary", operation.outcome_summary),
      decodeOperationJson(projectId, chainId, operation.step,
        "outcome_blockers", operation.outcome_blockers as unknown as unknown[]),
    ]);
    return {
      ok: operation.outcome === "ok",
      summary: typeof summary === "string"
        ? summary
        : "Numo completed the automation check.",
      blockers: Array.isArray(blockers)
        ? blockers.filter((item: unknown): item is string => typeof item === "string")
        : [],
    };
  }

  // Compatibility for verification workers launched before Numo owned steps.
  const { data, error } = await service
    .from("agent_runs")
    .select("id,project_id,verdict,verdict_ciphertext,verdict_encryption_version")
    .eq("chain_id", chainId)
    .or("verdict.not.is.null,verdict_ciphertext.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legacyAgentVerdictSchema(error)) {
    const legacy = await service.from("agent_runs").select("verdict")
      .eq("chain_id", chainId).not("verdict", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (legacy.error) throw new Error("Unable to read chain verdict");
    const verdict = legacy.data?.verdict as AgentRunVerdict | null | undefined;
    return verdict && typeof verdict.ok === "boolean" ? verdict : null;
  }
  if (error) throw new Error("Unable to read chain verdict");
  const decoded = data ? await decodeAgentVerdict(data as StoredAgentVerdict) : null;
  const verdict = decoded?.verdict ?? null;
  return verdict && typeof verdict.ok === "boolean" ? verdict : null;
}

/** Read the last archived chain run and its original intent. */
export async function lastRunOfChain(chainId: string): Promise<{
  id: string;
  intent: AgentLaunchIntent | null;
  status: string;
} | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_runs")
    .select("id, intent, status")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; intent: AgentLaunchIntent | null; status: string } | null) ?? null;
}
