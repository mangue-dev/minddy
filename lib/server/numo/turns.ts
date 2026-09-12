import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AssistantMention,
  AssistantPageContext,
  NumoTurnStatus,
} from "@/lib/assistant-types";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { AttachmentInput } from "@/lib/types";
import type { NumoDefaultStatus } from "@/lib/numo-default-status";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { resolveAiRuntime, type ResolvedAiRuntime } from "@/lib/server/ai-runtime";
import { recordAiUsage } from "@/lib/server/ai-usage";
import { gatherProjectPromptContext } from "@/lib/server/assistant/prompt-context";
import { buildAttachmentParts } from "@/lib/server/assistant/attachment-parts";
import {
  buildClockBlock,
  buildGlobalSystemPrompt,
  buildPageContextBlock,
  buildSystemPrompt,
} from "@/lib/server/assistant/prompt";
import { authorizedSkillsNotes } from "@/lib/server/assistant/skills";
import { commandNote } from "@/lib/server/assistant/commands";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  CONVERSATION_ASSISTANT_TOOLS,
  type AssistantToolDef,
} from "@/lib/server/assistant/tools";
import {
  AmbiguousToolExecutionError,
  getModelInputModalities,
  modelSupportsCaching,
  processChat,
  type ChatContentPart,
  type ChatMessage,
  type ProcessChatCheckpoint,
  type ToolExecutionLedger,
} from "@/lib/server/assistant/loop";
import type { ToolExecution } from "@/lib/server/assistant/execute-tool";
import { withoutWebSearch } from "@/lib/server/web-search";
import type { SafeEmitter } from "@/lib/server/assistant/sse";

export const NUMO_TURN_STATUSES = [
  "queued",
  "running",
  "waiting_work",
  "waiting_input",
  "stopping",
  "stopped",
  "retryable",
  "reconciling",
  "completed",
  "failed",
] as const;
export interface NumoTurnIntent {
  projectId: string | null;
  locale: string;
  timezone: string;
  numoDefaultStatus: NumoDefaultStatus;
  webSearchEnabled: boolean;
}

export type NumoTurnCheckpoint =
  | ProcessChatCheckpoint
  | { phase: "worker_wait"; active_run_id: string }
  | {
      phase: "worker_result";
      worker_event: { type: string; payload: Record<string, unknown> };
    }
  | { phase: "user_wait" | "done" };

export interface NumoTurn {
  id: string;
  conversation_id: string;
  user_id: string;
  request_id: string;
  run_id: string;
  status: NumoTurnStatus;
  intent: NumoTurnIntent;
  checkpoint: NumoTurnCheckpoint;
  model: string | null;
  reasoning_level: ReasoningLevel | null;
  active_run_id: string | null;
  claim_token: string | null;
  claimed_at: string | null;
  attempts: number;
  last_event_seq: number;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface BeginNumoTurnInput {
  conversationId: string;
  userId: string;
  requestId: string;
  runId: string;
  intent: NumoTurnIntent;
  model: string;
  reasoningLevel: ReasoningLevel;
  content: string;
  context: AssistantPageContext | null;
  metadata: Record<string, unknown>;
}

export type ExecuteNumoTurnResult =
  | { status: "not_claimed" }
  | { status: NumoTurnStatus; turn: NumoTurn };

class NumoClaimLostError extends Error {
  constructor() {
    super("Numo turn execution claim was lost");
    this.name = "NumoClaimLostError";
  }
}

function compositeRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

function checkpointRecord(checkpoint: NumoTurnCheckpoint): Record<string, unknown> {
  return checkpoint as unknown as Record<string, unknown>;
}

export async function beginNumoTurn(input: BeginNumoTurnInput): Promise<NumoTurn> {
  const { data, error } = await getServiceClient().rpc("begin_numo_turn", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_run_id: input.runId,
    p_intent: input.intent,
    p_model: input.model,
    p_reasoning_level: input.reasoningLevel,
    p_content: input.content,
    p_context: input.context,
    p_metadata: input.metadata,
  });
  if (error) throw new Error(error.message);
  const turn = compositeRow<NumoTurn>(data);
  if (!turn) throw new Error("Numo turn was not created");
  return turn;
}

const PERSISTED_EVENT_TYPES = new Set([
  "conversation_id",
  "reasoning_start",
  "reasoning_end",
  "tool_call_start",
  "tool_call_args_delta",
  "tool_call_complete",
  "message_complete",
  "done",
  "error",
]);

interface DurableEmitter extends SafeEmitter {
  flush(): Promise<void>;
}

/** Persists replay-safe activity while forwarding the lower-latency live feed. */
export function createDurableNumoEmitter(
  service: SupabaseClient,
  turnId: string,
  live?: SafeEmitter,
): DurableEmitter {
  let pendingContent = "";
  let chain = Promise.resolve();
  let closed = false;
  const enqueue = (operation: () => Promise<void>) => {
    chain = chain.then(operation).catch((error) => {
      // Activity is a replay projection. The durable turn checkpoint remains the
      // authority, so a journal outage must not strand an otherwise valid turn.
      console.error("[numo-turn] activity append failed:", error);
    });
  };

  const append = (type: string, payload: unknown) => {
    if (!PERSISTED_EVENT_TYPES.has(type)) return;
    enqueue(async () => {
      const { error } = await service.rpc("append_numo_turn_event", {
        p_turn_id: turnId,
        p_event_id: randomUUID(),
        p_type: type,
        p_payload: payload ?? {},
      });
      if (error) throw new Error(`Numo activity append failed: ${error.message}`);
    });
  };
  const flushContent = () => {
    if (!pendingContent) return;
    const delta = pendingContent;
    pendingContent = "";
    enqueue(async () => {
      const { error } = await service.rpc("append_numo_turn_event", {
        p_turn_id: turnId,
        p_event_id: randomUUID(),
        p_type: "content_delta",
        p_payload: { delta },
      });
      if (error) throw new Error(`Numo activity append failed: ${error.message}`);
    });
  };

  return {
    emit(event, data) {
      live?.emit(event, data);
      if (event === "content_delta") {
        const delta = (data as { delta?: unknown } | null)?.delta;
        if (typeof delta === "string") pendingContent += delta;
        return;
      }
      if (event === "reasoning_tick" || event === "tool_result") return;
      flushContent();
      append(event, data);
    },
    close() {
      if (closed) return;
      closed = true;
      live?.close();
    },
    get isClosed() {
      return closed || live?.isClosed === true;
    },
    async flush() {
      flushContent();
      await chain;
    },
  };
}

function mentionsNote(metadata: unknown): string {
  const mentions = (metadata as { mentions?: unknown } | null)?.mentions;
  if (!Array.isArray(mentions)) return "";
  const lines = mentions.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const mention = value as Partial<AssistantMention>;
    if (!mention.id || !mention.label || !mention.type) return [];
    const kind = mention.type === "member"
      ? "team member (user id"
      : mention.type === "page"
        ? "wiki page (page id"
        : `${mention.type} (id`;
    return [`@${mention.label} = ${kind}: ${mention.id})${mention.projectId ? ` (project id: ${mention.projectId})` : ""}`];
  });
  return lines.length ? `\n\n[Mentions in this message: ${lines.join("; ")}]` : "";
}

type StoredMessage = {
  id: string;
  turn_id: string | null;
  role: ChatMessage["role"];
  content: string | null;
  tool_calls: ChatMessage["tool_calls"] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  metadata: unknown;
  context: AssistantPageContext | null;
};

async function buildExecutionInput(input: {
  turn: NumoTurn;
  readClient: SupabaseClient;
  service: SupabaseClient;
  runtime: ResolvedAiRuntime;
  background: boolean;
}): Promise<{ messages: ChatMessage[]; tools: AssistantToolDef[] }> {
  const { turn, readClient, service, runtime } = input;
  const intent = turn.intent;
  let systemPrompt: string;
  if (intent.projectId) {
    const access = await getProjectAccess(turn.user_id, intent.projectId);
    if (!access) throw new Error("The attached project is no longer accessible");
    const promptProject = await gatherProjectPromptContext({
      supabase: readClient,
      service,
      project: access.project,
    });
    systemPrompt = buildSystemPrompt(promptProject, intent.locale, intent.numoDefaultStatus);
  } else {
    systemPrompt = buildGlobalSystemPrompt(intent.locale, intent.numoDefaultStatus);
  }
  if (intent.timezone) systemPrompt += buildClockBlock(intent.timezone);

  const { data, error } = await service
    .from("assistant_messages")
    .select("turn_id, role, content, tool_calls, tool_call_id, tool_name, metadata, context, created_at, id")
    .eq("conversation_id", turn.conversation_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const recentHistory = [...((data ?? []) as StoredMessage[])].reverse();
  // The bounded window can begin inside an older parallel tool batch. OpenAI
  // rejects a tool result without its preceding assistant call, so start at the
  // first complete message boundary instead of sending a malformed history.
  const firstCompleteMessage = recentHistory.findIndex((message) => message.role !== "tool");
  const history = firstCompleteMessage < 0 ? [] : recentHistory.slice(firstCompleteMessage);
  const historySkillNotes = input.background
    ? history.map(() => "")
    : await authorizedSkillsNotes(
        readClient,
        history.map((message) => message.role === "user" ? message.metadata : null),
      );

  const supportsCache = runtime.provider === "openrouter"
    && await modelSupportsCaching(runtime.model, runtime.apiKey);
  const systemMessage: ChatMessage = supportsCache
    ? {
        role: "system",
        content: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      }
    : { role: "system", content: systemPrompt };
  const messages: ChatMessage[] = [systemMessage];
  const rowAttachments = (message: StoredMessage): AttachmentInput[] => {
    if (message.role !== "user") return [];
    const raw = (message.metadata as { attachments?: unknown } | null)?.attachments;
    return Array.isArray(raw) ? raw as AttachmentInput[] : [];
  };
  const lastUserIndex = history.reduce(
    (last, message, index) => message.role === "user" ? index : last,
    -1,
  );
  const modalities = history.some((message) => rowAttachments(message).length > 0)
    ? runtime.provider === "openrouter"
      ? await getModelInputModalities(runtime.model, runtime.apiKey)
      : new Set(["text"])
    : null;
  const recoveringAssistantMessageId = turn.checkpoint?.phase === "tools"
    ? turn.checkpoint.assistantMessageId
    : null;
  const recoveringToolCallIds = new Set(
    turn.checkpoint?.phase === "tools"
      ? turn.checkpoint.pendingToolCalls?.map((call) => call.id) ?? []
      : [],
  );

  for (const [index, message] of history.entries()) {
    const recoveringPendingMessage = message.turn_id === turn.id && (
      (message.role === "assistant" && message.id === recoveringAssistantMessageId)
      || (message.role === "tool" && recoveringToolCallIds.has(message.tool_call_id ?? ""))
    );
    if (recoveringPendingMessage) continue;
    const sanitized = sanitizeAssistantMessageContent(message.content)
      + (message.role === "user"
        ? mentionsNote(message.metadata) + commandNote(message.metadata) + historySkillNotes[index]
          + (message.context
            ? `\n\n[Context captured for this message only; it does not authorize later actions]\n${buildPageContextBlock(message.context)}`
            : "")
        : "");
    const attachments = rowAttachments(message);
    let content: string | ChatContentPart[] = sanitized;
    if (attachments.length > 0 && modalities) {
      content = [
        { type: "text", text: sanitized },
        ...await buildAttachmentParts(service, attachments, {
          modalities,
          includeHeavy: index === lastUserIndex,
        }),
      ];
    }
    messages.push({
      role: message.role,
      content,
      tool_calls: message.tool_calls ?? undefined,
      tool_call_id: message.tool_call_id ?? undefined,
      name: message.tool_name ?? undefined,
    });
  }
  const workerEvent = turn.checkpoint?.phase === "worker_result"
    ? turn.checkpoint.worker_event
    : null;
  if (workerEvent) {
    messages.push({
      role: "system",
      content: `[Durable code-worker event]\n${JSON.stringify(workerEvent)}`,
    });
  }

  let tools: AssistantToolDef[] = input.background ? [] : CONVERSATION_ASSISTANT_TOOLS;
  if (!intent.webSearchEnabled) tools = withoutWebSearch(tools);
  return { messages, tools };
}

function createToolLedger(
  service: SupabaseClient,
  turnId: string,
  claimToken: string,
): ToolExecutionLedger {
  return {
    async claim(input) {
      const { data, error } = await service.rpc("claim_numo_tool_operation", {
        p_turn_id: turnId,
        p_claim_token: claimToken,
        p_tool_call_id: input.toolCallId,
        p_tool_name: input.toolName,
        p_arguments: input.args,
        p_replay_policy: input.replayPolicy,
      });
      if (error) throw new Error(error.message);
      const result = data as {
        action?: "execute" | "reuse" | "reconcile" | "lost_claim";
        success?: boolean;
        result?: unknown;
        model_result?: unknown;
        pause?: boolean;
      } | null;
      if (result?.action === "reuse") {
        const execution: ToolExecution = {
          success: result.success === true,
          result: result.result,
          modelResult: result.model_result,
          pause: result.pause === true,
        };
        return { action: "reuse", execution };
      }
      if (result?.action === "lost_claim" || !result?.action) {
        throw new NumoClaimLostError();
      }
      return { action: result.action };
    },
    async complete(input) {
      const { data, error } = await service.rpc("complete_numo_tool_operation", {
        p_turn_id: turnId,
        p_claim_token: claimToken,
        p_tool_call_id: input.toolCallId,
        p_success: input.success,
        p_result: input.result ?? null,
        p_model_result: input.modelResult ?? null,
        p_pause: input.pause,
      });
      if (error) throw new Error(error.message);
      if (data !== true) throw new NumoClaimLostError();
    },
  };
}

async function checkpointTurn(input: {
  service: SupabaseClient;
  turnId: string;
  claimToken: string;
  status: Exclude<NumoTurnStatus, "queued" | "stopping">;
  checkpoint?: Record<string, unknown>;
  activeRunId?: string | null;
  errorMessage?: string | null;
  outcome?: string | null;
  costUsd?: number | null;
}): Promise<NumoTurn> {
  const { data, error } = await input.service.rpc("checkpoint_numo_turn", {
    p_turn_id: input.turnId,
    p_claim_token: input.claimToken,
    p_status: input.status,
    p_checkpoint: input.checkpoint ?? {},
    p_active_run_id: input.activeRunId ?? null,
    p_error_message: input.errorMessage ?? null,
    p_outcome: input.outcome ?? null,
    p_cost_usd: input.costUsd ?? null,
  });
  if (error) throw new Error(error.message);
  const turn = compositeRow<NumoTurn>(data);
  if (!turn) throw new NumoClaimLostError();
  return turn;
}

async function stopRequested(service: SupabaseClient, turnId: string, claimToken: string) {
  const { data } = await service.from("numo_assistant_turns")
    .select("status").eq("id", turnId).eq("claim_token", claimToken).maybeSingle();
  return (data as { status?: string } | null)?.status === "stopping";
}

async function interruptActiveWorker(service: SupabaseClient, runId: string | null) {
  if (!runId) return;
  const { error } = await service.from("agent_runs")
    .update({ interrupt_requested: true })
    .eq("id", runId)
    .in("status", ["queued", "running"]);
  if (error) {
    console.error(`[numo-turn] worker ${runId} interrupt failed:`, error.message);
  }
}

async function saveFinalMessage(input: {
  service: SupabaseClient;
  turnId: string;
  conversationId: string;
  content: string;
  reasoning: unknown;
}): Promise<string | null> {
  const { data: existing } = await input.service.from("assistant_messages")
    .select("id").eq("turn_id", input.turnId).eq("role", "assistant")
    .is("tool_calls", null).maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await input.service.from("assistant_messages").insert({
    conversation_id: input.conversationId,
    turn_id: input.turnId,
    role: "assistant",
    content: input.content,
    ...(input.reasoning ? { metadata: { reasoning: input.reasoning } } : {}),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

export async function executeNumoTurn(input: {
  turnId: string;
  readClient?: SupabaseClient;
  liveEmitter?: SafeEmitter;
  aiRuntime?: ResolvedAiRuntime;
  allowRetryable?: boolean;
}): Promise<ExecuteNumoTurnResult> {
  const service = getServiceClient();
  const claimToken = randomUUID();
  const { data: claimedData, error: claimError } = await service.rpc("claim_numo_turn", {
    p_turn_id: input.turnId,
    p_claim_token: claimToken,
    p_allow_retryable: input.allowRetryable === true,
  });
  if (claimError) throw new Error(claimError.message);
  const claimed = compositeRow<NumoTurn>(claimedData);
  if (!claimed) return { status: "not_claimed" };
  let latestCheckpoint = claimed.checkpoint;
  let latestActiveRunId = claimed.active_run_id;

  const emitter = createDurableNumoEmitter(service, claimed.id, input.liveEmitter);
  emitter.emit("conversation_id", { conversationId: claimed.conversation_id, turnId: claimed.id });
  const background = claimed.checkpoint?.phase === "worker_result";
  const { data: savedFinal } = await service.from("assistant_messages")
    .select("id, content")
    .eq("turn_id", claimed.id)
    .eq("role", "assistant")
    .is("tool_calls", null)
    .maybeSingle();
  if (savedFinal?.id) {
    const turn = await checkpointTurn({
      service,
      turnId: claimed.id,
      claimToken,
      status: "completed",
      checkpoint: { phase: "done" },
      outcome: typeof savedFinal.content === "string" ? savedFinal.content : null,
    });
    emitter.emit("message_complete", { message_id: savedFinal.id });
    emitter.emit("done", { status: "completed" });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  }
  if (!input.readClient && !background) {
    const turn = await checkpointTurn({
      service,
      turnId: claimed.id,
      claimToken,
      status: "retryable",
      checkpoint: checkpointRecord(claimed.checkpoint),
      errorMessage: "The turn was interrupted before it reached a durable boundary. Retry after reconnecting.",
    });
    emitter.emit("error", { message: turn.error_message, status: turn.status });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  }

  try {
    const runtime = input.aiRuntime ?? await resolveAiRuntime({
      userId: claimed.user_id,
      modelKey: "assistant_model",
      surface: "assistant",
    });
    const readClient = input.readClient ?? service;
    const execution = await buildExecutionInput({
      turn: claimed,
      readClient,
      service,
      runtime,
      background,
    });
    const result = await processChat(execution.messages, execution.tools, emitter, {
      projectId: claimed.intent.projectId,
      requireExplicitProjectTarget: true,
      userId: claimed.user_id,
      supabase: readClient,
      service,
      locale: claimed.intent.locale,
      numoDefaultStatus: claimed.intent.numoDefaultStatus,
      model: runtime.model,
      aiRuntime: runtime,
      conversationId: claimed.conversation_id,
      reasoningLevel: claimed.reasoning_level ?? undefined,
      webSearch: claimed.intent.webSearchEnabled
        ? { runId: claimed.run_id, used: 0 }
        : undefined,
      turnId: claimed.id,
      resumeCheckpoint: claimed.checkpoint?.phase === "model" || claimed.checkpoint?.phase === "tools"
        ? claimed.checkpoint
        : null,
      persistCheckpoint: async (checkpoint) => {
        const persisted = await checkpointTurn({
          service,
          turnId: claimed.id,
          claimToken,
          status: "running",
          checkpoint: checkpoint as unknown as Record<string, unknown>,
          activeRunId: latestActiveRunId,
        });
        latestCheckpoint = persisted.checkpoint;
      },
      persistToolRound: async (toolRound) => {
        const { data, error } = await service.rpc("checkpoint_numo_tool_round", {
          p_turn_id: claimed.id,
          p_claim_token: claimToken,
          p_content: toolRound.assistantContent,
          p_tool_calls: toolRound.pendingToolCalls,
          p_reasoning: toolRound.assistantReasoning,
          p_round_count: toolRound.roundCount,
        });
        if (error) throw new Error(error.message);
        const persisted = compositeRow<NumoTurn>(data);
        if (!persisted) throw new NumoClaimLostError();
        latestCheckpoint = persisted.checkpoint;
        const messageId = persisted.checkpoint?.phase === "tools"
          ? persisted.checkpoint.assistantMessageId
          : null;
        if (!messageId) throw new Error("Assistant tool round checkpoint is incomplete");
        return messageId;
      },
      registerActiveRun: (runId) => {
        latestActiveRunId = runId;
      },
      toolLedger: createToolLedger(service, claimed.id, claimToken),
      shouldStop: () => stopRequested(service, claimed.id, claimToken),
    });

    if (result.generations.length > 0) {
      await recordAiUsage(result.generations.map((generation, sequence) => ({
        runId: claimed.run_id,
        seq: Math.max(0, claimed.attempts - 1) * 100 + sequence,
        feature: "numo_chat" as const,
        provider: runtime.provider,
        keyMode: runtime.mode,
        model: generation.model,
        generationId: generation.generationId,
        promptTokens: generation.promptTokens,
        completionTokens: generation.completionTokens,
        totalTokens: generation.totalTokens,
        cost: generation.cost,
        billTo: { userId: claimed.user_id },
        projectId: claimed.intent.projectId,
        conversationId: claimed.conversation_id,
      })));
    }

    if (await stopRequested(service, claimed.id, claimToken)) {
      const activeRunId = result.suspension?.kind === "work"
        ? result.suspension.runId
        : claimed.active_run_id;
      await interruptActiveWorker(service, activeRunId);
      const turn = await checkpointTurn({
        service,
        turnId: claimed.id,
        claimToken,
        status: "stopped",
        checkpoint: checkpointRecord(latestCheckpoint),
        activeRunId,
      });
      emitter.emit("done", { status: "stopped" });
      await emitter.flush();
      emitter.close();
      return { status: turn.status, turn };
    }

    if (result.fullContent) {
      const messageId = await saveFinalMessage({
        service,
        turnId: claimed.id,
        conversationId: claimed.conversation_id,
        content: result.fullContent,
        reasoning: result.finalReasoning,
      });
      if (messageId) emitter.emit("message_complete", { message_id: messageId });
    }

    const checkpoint = result.suspension?.kind === "work"
      ? { phase: "worker_wait", active_run_id: result.suspension.runId }
      : result.suspension?.kind === "input"
        ? { phase: "user_wait" }
        : { phase: "done" };
    const status: NumoTurnStatus = result.suspension?.kind === "work"
      ? "waiting_work"
      : result.suspension?.kind === "input"
        ? "waiting_input"
        : "completed";
    const costUsd = result.generations.reduce(
      (total, generation) => total + Math.max(0, generation.cost ?? 0),
      claimed.cost_usd,
    );
    const turn = await checkpointTurn({
      service,
      turnId: claimed.id,
      claimToken,
      status,
      checkpoint,
      activeRunId: result.suspension?.kind === "work" ? result.suspension.runId : null,
      outcome: result.fullContent || null,
      costUsd,
    });
    emitter.emit("done", { status });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  } catch (error) {
    if (error instanceof AmbiguousToolExecutionError) {
      emitter.emit("error", {
        message: "A tool may have completed before its result was recorded. Review the external state before retrying.",
        code: "tool_reconciliation_required",
        tool: error.toolName,
        status: "reconciling",
      });
      await emitter.flush();
      emitter.close();
      const { data } = await service.from("numo_assistant_turns").select("*")
        .eq("id", claimed.id).single();
      if (!data) return { status: "not_claimed" };
      return { status: "reconciling", turn: data as NumoTurn };
    }
    if (error instanceof NumoClaimLostError) {
      const { data } = await service.from("numo_assistant_turns").select("*")
        .eq("id", claimed.id).single();
      const current = data as NumoTurn;
      if (!current) {
        emitter.close();
        return { status: "not_claimed" };
      }
      if (current?.status === "stopping" && current.claim_token === claimToken) {
        await interruptActiveWorker(service, current.active_run_id);
        const stopped = await checkpointTurn({
          service,
          turnId: claimed.id,
          claimToken,
          status: "stopped",
          checkpoint: checkpointRecord(current.checkpoint),
          activeRunId: current.active_run_id,
        });
        emitter.emit("done", { status: "stopped" });
        await emitter.flush();
        emitter.close();
        return { status: stopped.status, turn: stopped };
      }
      emitter.close();
      return { status: current.status, turn: current };
    }

    const message = error instanceof Error ? error.message : "Numo turn failed";
    const status: "retryable" | "failed" = claimed.attempts < 3 ? "retryable" : "failed";
    const { data: currentClaim, error: currentClaimError } = await service
      .from("numo_assistant_turns")
      .select("checkpoint, active_run_id")
      .eq("id", claimed.id)
      .eq("claim_token", claimToken)
      .maybeSingle();
    if (currentClaimError) {
      // Do not overwrite a possibly committed checkpoint when the database
      // response itself was ambiguous. The stale-claim recovery will preserve
      // the authoritative row once connectivity returns.
      emitter.emit("error", { message, status: "running" });
      await emitter.flush();
      emitter.close();
      throw error;
    }
    const failureCheckpoint = (currentClaim as { checkpoint?: NumoTurnCheckpoint } | null)
      ?.checkpoint ?? latestCheckpoint;
    const failureActiveRunId = (currentClaim as { active_run_id?: string | null } | null)
      ?.active_run_id ?? claimed.active_run_id;
    let turn: NumoTurn;
    try {
      turn = await checkpointTurn({
        service,
        turnId: claimed.id,
        claimToken,
        status,
        checkpoint: checkpointRecord(failureCheckpoint),
        activeRunId: failureActiveRunId,
        errorMessage: message,
      });
    } catch (checkpointError) {
      if (!(checkpointError instanceof NumoClaimLostError)) throw checkpointError;
      const { data } = await service.from("numo_assistant_turns").select("*")
        .eq("id", claimed.id).single();
      if (!data) {
        emitter.close();
        return { status: "not_claimed" };
      }
      turn = data as NumoTurn;
      if (turn.status === "stopping" && turn.claim_token === claimToken) {
        await interruptActiveWorker(service, turn.active_run_id);
        turn = await checkpointTurn({
          service,
          turnId: claimed.id,
          claimToken,
          status: "stopped",
          checkpoint: checkpointRecord(turn.checkpoint),
          activeRunId: turn.active_run_id,
        });
        emitter.emit("done", { status: "stopped" });
        await emitter.flush();
        emitter.close();
        return { status: turn.status, turn };
      }
    }
    emitter.emit("error", { message, status: turn.status });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  }
}

export async function resumeNumoTurnFromWorker(input: {
  runId: string;
  eventId: string;
  type: "worker_completed" | "worker_failed" | "worker_input";
  payload: Record<string, unknown>;
}): Promise<"queued" | "duplicate" | "ignored"> {
  const { data, error } = await getServiceClient().rpc("resume_numo_turn_from_worker", {
    p_run_id: input.runId,
    p_event_id: input.eventId,
    p_type: input.type,
    p_payload: input.payload,
  });
  if (error) throw new Error(error.message);
  return data as "queued" | "duplicate" | "ignored";
}

export async function requestNumoTurnStop(conversationId: string, userId: string) {
  const { data, error } = await getServiceClient().rpc("request_numo_turn_stop", {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return compositeRow<NumoTurn>(data);
}

export async function retryNumoTurn(conversationId: string, userId: string) {
  const { data, error } = await getServiceClient().rpc("retry_numo_turn", {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return compositeRow<NumoTurn>(data);
}

export async function drainNumoTurns(options?: { limit?: number }) {
  const service = getServiceClient();
  const { error: recoveryError } = await service.rpc("recover_stale_numo_turns");
  if (recoveryError) throw new Error(recoveryError.message);
  const { data, error } = await service.from("numo_assistant_turns")
    .select("id, checkpoint")
    .eq("status", "queued")
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 10);
  if (error) throw new Error(error.message);
  let claimed = 0;
  for (const row of data ?? []) {
    const result = await executeNumoTurn({ turnId: row.id as string });
    if (result.status !== "not_claimed") claimed++;
  }
  return { claimed };
}
