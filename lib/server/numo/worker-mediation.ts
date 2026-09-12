import "server-only";

import { randomUUID } from "node:crypto";

import { checkAgentQuota } from "@/lib/server/agent/quota";
import { getRun, type AgentRun } from "@/lib/server/agent/runs";
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
