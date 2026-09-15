import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { checkAgentQuota } from "@/lib/server/agent/quota";
import {
  getRun,
  resumeLatestRunWithMessage,
  runIsLatestOnAnchor,
  type AgentRun,
} from "@/lib/server/agent/runs";
import { requestedRunReservationUsd } from "@/lib/server/agent/run-key";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { getServiceClient } from "@/lib/supabase-service";
import type {
  AssistantMention,
  AssistantPageContext,
} from "@/lib/assistant-types";

export interface WorkerInputCorrelation {
  parentTurnId: string;
  runId: string;
  questionId: string;
}

export type WorkerMessageDisposition =
  | { action: "none" }
  | { action: "steered"; turnId: string; runId: string }
  | { action: "answered"; turnId: string; runId: string }
  | { action: "already"; turnId: string; runId: string }
  | { action: "refused"; reason: string };

function managedResumeBudget(run: AgentRun, quota: Awaited<ReturnType<typeof checkAgentQuota>>) {
  if (run.key_mode !== "platform") {
    return { usageSince: null, budgetCap: null, requestedBudget: null };
  }
  if (quota.mode !== "platform" || quota.cap == null || !quota.periodStart) {
    return null;
  }
  return {
    usageSince: quota.periodStart,
    budgetCap: quota.cap,
    requestedBudget: requestedRunReservationUsd({
      runBudgetUsd: run.budget_usd,
      accountCapUsd: quota.cap,
    }),
  };
}

/** Warm-resume one worker only when its durable pending question still matches. */
export async function answerNumoWorkerInput(input: {
  conversationId: string;
  userId: string;
  correlation: WorkerInputCorrelation;
  answer: string;
  messageId?: string;
  persistParentMessage: boolean;
}): Promise<WorkerMessageDisposition> {
  const run = await getRun(input.correlation.runId);
  if (
    !run
    || run.created_by !== input.userId
    || run.parent_numo_conversation_id !== input.conversationId
    || run.parent_numo_turn_id !== input.correlation.parentTurnId
  ) {
    return { action: "refused", reason: "worker_input_mismatch" };
  }

  const quota = await checkAgentQuota(input.userId);
  if (!quota.allowed) return { action: "refused", reason: "quota_exceeded" };
  const budget = managedResumeBudget(run, quota);
  if (!budget) return { action: "refused", reason: "quota_exceeded" };

  const service = getServiceClient();
  const { data, error } = await service.rpc("resume_numo_worker_input", {
    p_conversation_id: input.conversationId,
    p_parent_turn_id: input.correlation.parentTurnId,
    p_run_id: input.correlation.runId,
    p_question_id: input.correlation.questionId,
    p_user_id: input.userId,
    p_message_id: input.messageId ?? randomUUID(),
    p_answer: input.answer.trim(),
    p_persist_parent_message: input.persistParentMessage,
    p_not_before: new Date().toISOString(),
    p_usage_since: budget.usageSince,
    p_budget_cap: budget.budgetCap,
    p_requested_budget: budget.requestedBudget,
  });
  if (error) throw new Error(`Worker input resume failed: ${error.message}`);
  if (data === "queued") {
    kickAgentDrain(service);
    return {
      action: "answered",
      turnId: input.correlation.parentTurnId,
      runId: input.correlation.runId,
    };
  }
  if (data === "already") {
    kickAgentDrain(service);
    return {
      action: "already",
      turnId: input.correlation.parentTurnId,
      runId: input.correlation.runId,
    };
  }
  return { action: "refused", reason: String(data ?? "ignored") };
}

/** Route ordinary parent-conversation steering to its currently awaited worker. */
export async function steerNumoWorker(input: {
  conversationId: string;
  userId: string;
  messageId: string;
  content: string;
  parentContent?: string;
  mentions?: AssistantMention[];
  context?: AssistantPageContext | null;
  metadata?: Record<string, unknown>;
}): Promise<WorkerMessageDisposition> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("steer_numo_worker", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
    p_message_id: input.messageId,
    p_content: input.content.trim(),
    p_parent_content: input.parentContent?.trim() || null,
    p_mentions: input.mentions ?? null,
    p_context: input.context ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw new Error(`Worker steering failed: ${error.message}`);
  const result = data as {
    action?: string;
    turn_id?: string;
    run_id?: string;
    result?: string;
  } | null;
  if (result?.action === "none") return { action: "none" };
  if (result?.action === "steered" && result.turn_id && result.run_id) {
    kickAgentDrain(service);
    return { action: "steered", turnId: result.turn_id, runId: result.run_id };
  }
  return { action: "refused", reason: result?.result ?? "worker_steering_refused" };
}

/** How long a sandbox-reap claim may block a resume before it is considered stale. */
const SANDBOX_REAP_CLAIM_STALE_MS = 10 * 60_000;

/** At-rest statuses a delegated worker may be relaunched from. */
const RELAUNCH_FROM: AgentRun["status"][] = ["completed", "failed", "canceled"];

/**
 * The steering message id must survive a checkpoint replay: a re-executed turn
 * would call relaunchNumoWorkerRun again for the same tool call, and a random
 * id would double-queue the message. Turn id + tool call id harden into a
 * valid v4 UUID (version and variant bits rewritten from the digest).
 */
function delegatedRelaunchMessageId(
  parentTurnId: string,
  toolCallId: string,
): string {
  const hex = createHash("sha256")
    .update(`${parentTurnId}:${toolCallId}`)
    .digest("hex")
    .slice(0, 32);
  const withVersion = `${hex.slice(0, 12)}4${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${withVersion.slice(0, 8)}-${withVersion.slice(8, 12)}-${withVersion.slice(12, 16)}-${withVersion.slice(16, 20)}-${withVersion.slice(20, 32)}`;
}

/**
 * RELAUNCH a FINISHED delegated worker IN PLACE — the Numo-facing counterpart
 * of the standalone `/api/agent-runs/[runId]/steer` hot path. Same run, same
 * conversation, same code conversation and branch; the deterministic sandbox
 * name wakes the microVM snapshot so the session (and any uncommitted working
 * tree) resumes where it stopped. The parent turn is relinked first so the
 * eventual delegation delivery lands on the CURRENTLY waiting turn.
 *
 * Launch a NEW lineage run instead when the targeted run does not qualify —
 * that is `launchAgentRun`'s existing `continuation_run_id` contract.
 */
export async function relaunchNumoWorkerRun(input: {
  conversationId: string;
  userId: string;
  runId: string;
  message: string;
  mentions?: AssistantMention[];
  parentTurnId: string;
  parentToolCallId: string;
}): Promise<
  { ok: true; run: AgentRun } | { ok: false; code: string }
> {
  const run = await getRun(input.runId);
  if (!run) return { ok: false, code: "not_found" };
  if (run.parent_numo_conversation_id !== input.conversationId) {
    return { ok: false, code: "not_conversation_worker" };
  }
  if (!RELAUNCH_FROM.includes(run.status)) {
    return { ok: false, code: "still_working" };
  }
  if (run.awaiting_input) return { ok: false, code: "awaiting_input" };
  if (run.pr_state === "merged") return { ok: false, code: "pr_merged" };
  if (run.local_exec) return { ok: false, code: "local_execution_retired" };
  if (!(await runIsLatestOnAnchor(run))) {
    return { ok: false, code: "superseded" };
  }

  // The caller's agents right is checked at the turn level already; the resume
  // is a billable turn on the OWNER's key — same budget control as /steer.
  const ownerId = run.created_by;
  if (!ownerId) return { ok: false, code: "not_found" };
  const quota =
    ownerId === input.userId
      ? await checkAgentQuota(input.userId)
      : await checkAgentQuota(ownerId);
  if (!quota.allowed) return { ok: false, code: "quota_exceeded" };
  const budget = managedResumeBudget(run, quota);
  if (!budget) return { ok: false, code: "quota_exceeded" };

  // A fresh inactivity-reaper claim must not race the resume; the /steer wild
  // rule applies — a barely-stale claim is released, a fresh one refuses.
  if (run.sandbox_reap_claim) {
    const claimedAt = Date.parse(run.sandbox_reap_claimed_at ?? "");
    if (
      Number.isFinite(claimedAt)
      && Date.now() - claimedAt <= SANDBOX_REAP_CLAIM_STALE_MS
    ) {
      return { ok: false, code: "sandbox_reaping" };
    }
  }

  const messageWithMentions = input.message.trim();
  if (!messageWithMentions) {
    throw new Error("relaunch requires a non-empty message");
  }
  const state = await resumeLatestRunWithMessage({
    runId: input.runId,
    ownerId,
    actorId: input.userId,
    messageId: delegatedRelaunchMessageId(input.parentTurnId, input.parentToolCallId),
    content: messageWithMentions,
    mentions: input.mentions ?? null,
    notBefore: new Date().toISOString(),
    usageSince: budget.usageSince,
    budgetCap: budget.budgetCap,
    requestedBudget: budget.requestedBudget,
  });
  if (state === "no_budget") return { ok: false, code: "quota_exceeded" };
  if (state === "superseded") return { ok: false, code: "superseded" };
  if (state !== "queued" && state !== "already") {
    return { ok: false, code: String(state) };
  }

  // Reattach the CURRENT parent turn: the delegation delivery matcher looks
  // for any `waiting_work` turn whose `active_run_id` is this run, but the run
  // row itself should carry the newest delegation for notifications and dedup.
  await getServiceClient()
    .from("agent_runs")
    .update({
      parent_numo_turn_id: input.parentTurnId,
      parent_numo_tool_call_id: input.parentToolCallId,
    })
    .eq("id", input.runId);

  const resumed = await getRun(input.runId);
  if (resumed) kickAgentDrain(getServiceClient());
  if (!resumed) return { ok: false, code: "not_found" };
  return { ok: true, run: resumed };
}
