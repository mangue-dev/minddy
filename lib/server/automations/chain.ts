import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import type { AgentRunVerdict } from "@/lib/server/agent/runs";
import type { NumoAutomationContext, NumoTurn } from "@/lib/server/numo/turns";

/**
 * The CHAIN ​​(MIN-147) — the durable object without which nothing else is
 * possible: neither the human breakpoint, nor the "stop" button, nor the end report
 *. It bears the current step, the rules already played, the cumulative expenditure
 * (for SAYING it, not for cutting), the number of restarts and the reason
 * for stopping.
 *
 * End-to-end customer service (no write policy on `agent_chains`).
 *
 * Competition: advancement is done by COMPARE-AND-SET on `(id, step)`. Two
 * brackets that would conclude the same step cannot play it twice — the losing
 * receives `null` and returns the hand. No new SQL function: the CAS
 * fits in the `.eq("step", …)` of the update.
 */

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

/**
 * Statuses of a LIVE chain — those covered by the unique index per ticket.
 * `pending` is one of them: a suspended ticket is BUSY, otherwise a second chain would open on it and both would start.
 */
export const LIVE_CHAIN_STATUSES: AgentChainStatus[] = [
  "pending",
  "running",
  "awaiting_human",
];

/** Postgres code for a unique constraint violation. */
const PG_UNIQUE_VIOLATION = "23505";

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

/**
 * Opens a channel on a ticket. `null` if a string is ALREADY alive:
 * the unique partial index `idx_agent_chains_active_issue` slices, and we treat
 * its violation as a response and not as a failure — same doctrine
 * as `ActiveRunExistsError` for runs.
 */
export async function openChain(input: {
  projectId: string;
  issueId: string;
  ownerId: string;
  preset: string | null;
  /** Respite: the time before which it does not start. Absent = immediately. */
  notBefore?: string | null;
  /** The event to replay when waking up. Mandatory with `notBefore`. */
  pendingEvent?: PendingChainEvent | null;
}): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("agent_chains")
    .insert({
      project_id: input.projectId,
      issue_id: input.issueId,
      owner_id: input.ownerId,
      preset: input.preset,
      ...(input.notBefore
        ? {
            status: "pending",
            not_before: input.notBefore,
            pending_event: input.pendingEvent ?? null,
          }
        : {}),
    })
    .select("*")
    .single();
  if (error || !data) {
    if (error?.code === PG_UNIQUE_VIOLATION) return null;
    console.error("[automations] openChain failed:", error?.message);
    return null;
  }
  return toChain(data);
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

/** Reserve one canonical Numo operation for a chain step. */
export async function ensureNumoAutomationOperation(input: {
  chain: AgentChain;
  ruleId: string;
  mode: NumoAutomationContext["mode"];
  title: string;
  requestId: string;
  prompt: string;
  locale: string;
  context: NumoAutomationContext;
}): Promise<NumoAutomationOperation> {
  const { data, error } = await getServiceClient().rpc(
    "ensure_numo_automation_operation",
    {
      p_chain_id: input.chain.id,
      p_step: input.chain.step,
      p_rule_id: input.ruleId,
      p_mode: input.mode,
      p_user_id: input.chain.owner_id,
      p_title: input.title,
      p_request_id: input.requestId,
      p_prompt: input.prompt,
      p_locale: input.locale,
      p_context: input.context,
    },
  );
  if (error || !data) {
    throw new Error(error?.message ?? "Numo automation operation was not reserved");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row as NumoAutomationOperation;
}

/** Bind admission before execution so recovery always has one operation owner. */
export async function bindNumoAutomationOperation(
  operationId: string,
  turnId: string,
): Promise<NumoAutomationOperation> {
  const service = getServiceClient();
  const { data: existing, error: readError } = await service
    .from("numo_automation_operations")
    .select("*")
    .eq("id", operationId)
    .single();
  if (readError || !existing) {
    throw new Error(readError?.message ?? "Numo automation operation was not found");
  }
  if (existing.turn_id && existing.turn_id !== turnId) {
    throw new Error("Numo automation operation is already bound to another turn");
  }
  if (existing.turn_id === turnId) return existing as NumoAutomationOperation;

  const { data, error } = await service
    .from("numo_automation_operations")
    .update({ turn_id: turnId })
    .eq("id", operationId)
    .is("turn_id", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return data as NumoAutomationOperation;

  const { data: raced, error: racedError } = await service
    .from("numo_automation_operations")
    .select("*")
    .eq("id", operationId)
    .eq("turn_id", turnId)
    .maybeSingle();
  if (racedError || !raced) {
    throw new Error(racedError?.message ?? "Numo automation operation binding was lost");
  }
  return raced as NumoAutomationOperation;
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
  if (!operation.turn_id) {
    return { operation: operation as NumoAutomationOperation, turn: null };
  }
  const { data: turn, error: turnError } = await service
    .from("numo_assistant_turns")
    .select("*")
    .eq("id", operation.turn_id)
    .maybeSingle();
  if (turnError) throw new Error(turnError.message);
  return {
    operation: operation as NumoAutomationOperation,
    turn: (turn as NumoTurn | null) ?? null,
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
  return (data as NumoAutomationOperation | null) ?? null;
}

export async function activeNumoAutomationOperation(
  chainId: string,
): Promise<NumoAutomationOperationState | null> {
  const state = await lastNumoAutomationOperation(chainId);
  if (!state) return null;
  if (!state.turn) return state;
  return ["completed", "failed", "stopped"].includes(state.turn.status)
    ? null
    : state;
}

export async function retryableNumoAutomationOperations(
  limit = 25,
): Promise<NumoAutomationOperationState[]> {
  const service = getServiceClient();
  const { data: operations, error } = await service.rpc(
    "retryable_numo_automation_operations",
    { p_limit: limit },
  );
  if (error) throw new Error(error.message);
  const rows = (operations ?? []) as NumoAutomationOperation[];
  const turnIds = rows.map((operation) => operation.turn_id).filter((id): id is string => !!id);
  if (turnIds.length === 0) return [];
  const { data: turns, error: turnError } = await service
    .from("numo_assistant_turns")
    .select("*")
    .in("id", turnIds);
  if (turnError) throw new Error(turnError.message);
  const byId = new Map(((turns ?? []) as NumoTurn[]).map((turn) => [turn.id, turn]));
  return rows.map((operation) => ({
    operation,
    turn: byId.get(operation.turn_id!) ?? null,
  }));
}

/**
 * ADVANCES the chain one step by marking the rule played — the compare-and-set
 * which ensures that a step is only played once. `null` = another played it
 * (or the chain is no longer `running`): the caller returns the hand WITHOUT throwing anything.
 */
export async function advanceChain(
  chain: AgentChain,
  ruleId: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({
      step: chain.step + 1,
      played_rule_ids: [...chain.played_rule_ids, ruleId],
      status: "running",
    })
    .eq("id", chain.id)
    .eq("step", chain.step)
    // NOT `LIVE_CHAIN_STATUSES`: a suspended chain does not move forward, it
    // wake up first (`startPendingChain`), and this wake-up re-checks that the
    // condition qui l'a ouverte tient toujours. Avancer directement ferait sauter
    // this check — and the update above would change it to `running` in passing.
    // NI `awaiting_human`: this is the status which materializes “the loop is waiting
    // a human", and the only legitimate way out is `resumeChain`
    // (explicit green light). Accepting it here opened a second door: an engine
    // competitor who found the string between `advanceChain` and `parkChain`
    // could skip the breakpoint SILENTLY, after the comment
    // “the rest awaits your green light” has been posted. The engine guarantees all
    // `status === "running"` way before any call: don't lose anything here.
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * RECALCULATES the channel's spend from its runs. Idempotent by
 * construction — and that's the whole point.
 *
 * The old version accumulated a delta (`spent += run.cost_usd`) by betting on
 * "exactly once per run". Now `stampRun` guarantees exactly once
 * per TERMINAL TRANSITION, and a run crosses several by design:
 * the agent asks a question (rest), it is answered (`/steer` the re-queue), it
 * leaves, it rests again. As `agent_runs.cost_usd` is CUMULATIVE, each
 * rest added the total of the run from the start: a five-round run of 0.10
 * displayed 1.50 for every 0.50 actually spent.
 *
 * A reread amount cannot not drift, regardless of the number of calls.
 */
export async function recomputeChainSpend(chainId: string): Promise<number> {
  const service = getServiceClient();
  const { data: operations, error: operationError } = await service
    .from("numo_automation_operations")
    .select("turn_id")
    .eq("chain_id", chainId);
  if (operationError) throw new Error(operationError.message);
  const turnIds = ((operations ?? []) as Array<{ turn_id: string | null }>)
    .map((row) => row.turn_id)
    .filter((id): id is string => !!id);
  if ((operations ?? []).length > 0) {
    const { data: turns, error: turnError } = turnIds.length > 0
      ? await service.from("numo_assistant_turns").select("cost_usd").in("id", turnIds)
      : { data: [], error: null };
    if (turnError) throw new Error(turnError.message);
    const total = ((turns ?? []) as Array<{ cost_usd: number | string | null }>).reduce(
      (sum, row) => sum + (Number(row.cost_usd) || 0),
      0,
    );
    const next = Number(total.toFixed(6));
    await service.from("agent_chains").update({ spent_usd: next }).eq("id", chainId);
    return next;
  }

  // Compatibility for chains already launched before Numo operation routing.
  const { data } = await service
    .from("agent_runs")
    .select("cost_usd")
    .eq("chain_id", chainId);
  const total = ((data ?? []) as Array<{ cost_usd: number | string | null }>).reduce(
    (sum, row) => sum + (Number(row.cost_usd) || 0),
    0,
  );
  const next = Number(total.toFixed(6));
  await service.from("agent_chains").update({ spent_usd: next }).eq("id", chainId);
  return next;
}

/**
 * Wakes up a SUSPENDED channel. Compare-and-set on `pending`: the sweeper and
 * a simultaneous “Launch Now” cannot start it twice.
 */
export async function startPendingChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "running", not_before: null })
    .eq("id", chainId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Cancels a suspended chain. QUIET on purpose — no comments, no
 * notice: she played nothing, spent nothing, and produced nothing that merits
 * a report. Announcing "the chain has stopped" for a job that has never started would be noise on the ticket.
 */
export async function cancelPendingChain(
  chainId: string,
  reason: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "stopped", stop_reason: reason, not_before: null })
    .eq("id", chainId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Suspended channels DUE. Read by the scanner (cron): it is he who wakes them, the window of a `after()` not surviving five minutes of waiting.
 */
export async function duePendingChains(limit = 50): Promise<AgentChain[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("status", "pending")
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .limit(limit);
  return ((data ?? []) as unknown[]).map(toChain);
}

/**
 * ABANDONED `running` chains: nothing carries them anymore.
 *
 * The system had no net for `running`. A string only comes out through the
 * hook at the end of the run — but this hook is a promise in flight, which a function
 * which freezes takes away; and if a manual run starts in the meantime, the engine
 * gives up and the manual run does not carry any `chain_id`: no more
 * events will ever occur. As `running` is part of the unique index per
 * ticket, this ticket would NEVER accept automation again.
 *
 * The threshold is purposely wide (well beyond the latency of a hook): this
 * scan only catches what is obviously dead. And the catch-up is
 * without risk — it's the compare-and-set of `advanceChain` that decides in the end,
 * so a simply slow event cannot produce a double launch.
 */
export async function staleRunningChains(
  staleBefore: string,
  limit = 25,
): Promise<AgentChain[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .select("*")
    .eq("status", "running")
    .lt("updated_at", staleBefore)
    .order("updated_at", { ascending: true })
    .limit(limit);
  return ((data ?? []) as unknown[]).map(toChain);
}

/** Park the chain: it is waiting for an explicit human green light. */
export async function parkChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "awaiting_human" })
    .eq("id", chainId)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** Human green light: the chain starts again. `null` if she didn't wait. */
export async function resumeChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "running" })
    .eq("id", chainId)
    .eq("status", "awaiting_human")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Stops the chain. `reason` is a CODE (`quota`, `interrupted`,
 * `verification_failed`, `noRepo`, `run_failed`…), never a sentence: it is the
 * report comment which translates it, into the language of the reader.
 */
export async function stopChain(
  chainId: string,
  reason: string,
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "stopped", stop_reason: reason })
    .eq("id", chainId)
    .in("status", LIVE_CHAIN_STATUSES)
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/** The channel has gone to the end of its rules: nothing left to play. */
export async function completeChain(chainId: string): Promise<AgentChain | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_chains")
    .update({ status: "completed" })
    .eq("id", chainId)
    .in("status", LIVE_CHAIN_STATUSES)
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * Resumption after a failed implementation check: we increment the
 * restart counter and we DEMARK the rules to be replayed (implement, then
 * check). The plan remains written — it’s not the one we redo.
 */
export async function retryChain(
  chain: AgentChain,
  replayRuleIds: readonly string[],
): Promise<AgentChain | null> {
  const service = getServiceClient();
  const kept = chain.played_rule_ids.filter((id) => !replayRuleIds.includes(id));
  const { data } = await service
    .from("agent_chains")
    .update({ retries: chain.retries + 1, played_rule_ids: kept })
    .eq("id", chain.id)
    .eq("status", "running")
    .select("*")
    .maybeSingle();
  return data ? toChain(data) : null;
}

/**
 * The last VERDICT rendered on the chain (tool `report_verdict`). Two readers,
 * and that's why it's here rather than at one of them: the engine, which
 * decides between continuing, resuming and giving back; and the human breakpoint
 *, whose comment must SAY what the check concluded — without
 * which announces a "verified" plan without the check's verdict.
 */
export async function lastVerdictOfChain(chainId: string): Promise<AgentRunVerdict | null> {
  const service = getServiceClient();
  const { data: operation, error: operationError } = await service
    .from("numo_automation_operations")
    .select("mode, outcome, outcome_summary, outcome_blockers")
    .eq("chain_id", chainId)
    .in("mode", ["plan", "verify"])
    .not("outcome", "is", null)
    .order("step", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (operationError) throw new Error(operationError.message);
  if (operation?.outcome) {
    return {
      ok: operation.outcome === "ok",
      summary: typeof operation.outcome_summary === "string"
        ? operation.outcome_summary
        : "Numo completed the automation check.",
      blockers: Array.isArray(operation.outcome_blockers)
        ? operation.outcome_blockers.filter((item: unknown): item is string => typeof item === "string")
        : [],
    };
  }

  // Compatibility for verification workers launched before Numo owned steps.
  const { data } = await service
    .from("agent_runs")
    .select("verdict")
    .eq("chain_id", chainId)
    .not("verdict", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const verdict = (data as { verdict?: AgentRunVerdict | null } | null)?.verdict ?? null;
  return verdict && typeof verdict.ok === "boolean" ? verdict : null;
}

/** The last run in the chain — what a human restart should replay. */
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
