import { withRoutineCause } from "@/lib/server/supabase-fetch";
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
import {
  recordAiUsage,
  spentFromNumoOperation,
  spentFromNumoOperationPlatform,
} from "@/lib/server/ai-usage";
import { getUserUsage } from "@/lib/server/usage";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { nextBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import { isManagedAiEnabled } from "@/lib/managed-services";
import { gatherProjectPromptContext } from "@/lib/server/assistant/prompt-context";
import { buildAttachmentParts } from "@/lib/server/assistant/attachment-parts";
import type { PromptAttachment } from "@/lib/server/assistant/attachment-parts";
import {
  buildClockBlock,
  buildGlobalSystemPrompt,
  buildPageContextBlock,
  buildSystemPrompt,
} from "@/lib/server/assistant/prompt";
import { authorizedSkillsNotes } from "@/lib/server/assistant/skills";
import { commandNote } from "@/lib/server/assistant/commands";
import { buildDocumentationHelpPrompt } from "@/lib/server/assistant/documentation-help";
import { sanitizeAssistantMessageContent } from "@/lib/server/assistant/sanitize";
import {
  CONVERSATION_ASSISTANT_TOOLS,
  type AssistantToolDef,
} from "@/lib/server/assistant/tools";
import { readerToolSet } from "@/lib/server/assistant/tool-capabilities";
import {
  AmbiguousToolExecutionError,
  NumoCompletionError,
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
import { decodeNumoTurnIntent, encodeNumoTurnIntent,
  shouldProtectNumoTurnIntent } from "./turn-intent-content";
import { encodeNumoUserMessage, hydrateNumoUserMessages,
  shouldProtectNumoUserMessages } from "./user-message-content";
import { decodeNumoFinalMessage, decodeNumoTurnOutcome,
  encodeNumoFinalMessage, encodeNumoTurnOutcome,
  hydrateNumoFinalMessages, shouldProtectNumoFinalContent } from "./final-content";
import { encodeNumoTurnEvent,
  shouldProtectNumoTurnEvents } from "./turn-event-content";
import { decodeNumoError, encodeNumoError,
  shouldProtectNumoErrors } from "./error-content";
import { decodeNumoCheckpoint, encodeNumoCheckpoint,
  encodeNumoToolMessage, hydrateNumoToolMessages,
  shouldProtectNumoToolContent } from "./tool-content";
import { decodeNumoToolOperationValue, encodeNumoToolOperationValue,
  numoToolArgumentsDigest } from "./tool-operation-content";
import type { SafeEmitter } from "@/lib/server/assistant/sse";
import {
  failNumoSurfaceProjection,
  projectNumoSurfaceTurn,
  withNumoSurfaceEmitter,
} from "./surface-projection";
import { notifyRoutineOfNumoTurn } from "@/lib/server/routine-hooks";

export const NUMO_TURN_STATUSES = [
  "queued",
  "running",
  "waiting_input",
  "stopping",
  "stopped",
  "retryable",
  "reconciling",
  "completed",
  "failed",
] as const;
export interface NumoTurnIntent {
  /** Public help uses the same billing and durable lifecycle, with restricted tools. */
  documentation?: Omit<NonNullable<AssistantPageContext["documentation"]>, "locale">;
  projectId: string | null;
  locale: string;
  timezone: string;
  numoDefaultStatus: NumoDefaultStatus;
  /** Always true since the admin switch was removed (MIN-733); turns queued before may carry false. */
  webSearchEnabled: boolean;
  /** Preserve comment-origin semantics for activity. */
  triggerSource?: "chat" | "mention";
  /** Routine operation identity; the turn id is the occurrence identity. */
  routineId?: string | null;
  routineOrigin?: "scheduled" | "manual" | "event" | "database" | null;
  routineProvenance?: { eventId: string; subjectId: string; subjectType: "issue" | "page" | "feedback"; causeRoutineIds?: string[] } | null;
  routineScheduledFor?: string | null;
  /** Shared cap across every generation of the operation. */
  operationBudgetUsd?: number | null;
  /** User-facing percentage retained in the same unit as routine settings. */
  operationBudgetPercent?: number | null;
}

export type NumoTurnCheckpoint =
  | ProcessChatCheckpoint
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
  claim_token: string | null;
  claimed_at: string | null;
  attempts: number;
  last_event_seq: number;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  managed_budget_usd?: number | null;
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
  content: string | null;
  context: AssistantPageContext | null;
  metadata: Record<string, unknown>;
  managedBudget?: {
    periodStart: string;
    accountCapUsd: number;
    requestedUsd: number;
  };
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

export class NumoBudgetReservationError extends Error {
  constructor(
    readonly spentUsd: number | null = null,
    readonly reservedUsd: number | null = null,
  ) {
    super("No managed AI budget remains for this Numo operation");
    this.name = "NumoBudgetReservationError";
  }
}

interface NumoUsageExhaustedDetails {
  cause: "account" | "routine_cap" | "operation_allocation";
  percent: number;
  resetsAt: string | null;
  nextPlanId: BillingPlanId | null;
  byok: boolean;
  routineId: string | null;
}

class NumoUsageExhaustedError extends Error {
  constructor(readonly details: NumoUsageExhaustedDetails) {
    super("Numo operation usage budget exhausted");
    this.name = "NumoUsageExhaustedError";
  }
}

function compositeRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return (data as T | null) ?? null;
}

export async function hydrateNumoTurn<T extends NumoTurn>(row: T,
  actorId: string | null = null): Promise<T> {
  const intent = await decodeNumoTurnIntent(row.intent as unknown as Record<string, unknown>, {
    userId: row.user_id, conversationId: row.conversation_id,
    requestId: row.request_id,
  }, actorId);
  const outcome = await decodeNumoTurnOutcome(row.user_id, row.id,
    row.outcome, actorId);
  const errorMessage = await decodeNumoError(row.user_id,
    "numo_assistant_turns", row.id, row.error_message, actorId);
  const checkpoint = await decodeNumoCheckpoint(row.user_id, row.id,
    (row.checkpoint ?? {}) as unknown as Record<string, unknown>, actorId);
  return { ...row, intent: intent as unknown as NumoTurnIntent,
    checkpoint: checkpoint as unknown as NumoTurnCheckpoint,
    outcome, error_message: errorMessage };
}

function checkpointRecord(checkpoint: NumoTurnCheckpoint): Record<string, unknown> {
  return checkpoint as unknown as Record<string, unknown>;
}

export async function beginNumoTurn(input: BeginNumoTurnInput): Promise<NumoTurn> {
  const admissionStartedAt = performance.now();
  const service = getServiceClient();
  const messageId = randomUUID();
  const prepareUserMessage = async () => await shouldProtectNumoUserMessages(service)
    ? encodeNumoUserMessage(input.userId, messageId, {
        content: input.content,
        context: input.context as Record<string, unknown> | null,
        metadata: input.metadata,
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
      }) : null;
  const prepareIntent = async () => await shouldProtectNumoTurnIntent(service)
    ? encodeNumoTurnIntent(input.userId, input.conversationId,
      input.requestId, input.intent as unknown as Record<string, unknown>)
    : input.intent;
  // The two protected payloads have independent bindings. Prepare both before
  // the authoritative admission RPC instead of serializing their scope reads.
  const [protectedMessage, intent] = await Promise.all([prepareUserMessage(), prepareIntent()]);
  console.info("[numo-chat] timing", { requestId: input.requestId, phase: "admission_protection_prepared",
    admissionElapsedMs: Math.round(performance.now() - admissionStartedAt) });
  const params = {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_run_id: input.runId,
    p_intent: intent,
    p_model: input.model,
    p_reasoning_level: input.reasoningLevel,
    p_message_id: messageId,
    p_user_payload_version: protectedMessage?.user_payload_version ?? 0,
    p_content: protectedMessage?.content ?? input.content,
    p_context: protectedMessage ? null : input.context,
    p_metadata: protectedMessage ? {} : input.metadata,
  };
  const { data, error } = input.managedBudget
    ? await service.rpc("begin_numo_turn_with_budget", {
        ...params,
        p_usage_since: input.managedBudget.periodStart,
        p_budget_cap: input.managedBudget.accountCapUsd,
        p_requested_budget: input.managedBudget.requestedUsd,
      })
    : await service.rpc("begin_numo_turn", params);
  if (error) throw new Error(error.message);
  const turn = input.managedBudget
    ? ((data as { turn?: NumoTurn | null } | null)?.turn ?? null)
    : compositeRow<NumoTurn>(data);
  if (!turn && input.managedBudget) {
    const reservation = data as { spent_usd?: unknown; reserved_usd?: unknown } | null;
    const amount = (value: unknown): number | null => {
      if (typeof value !== "number" && typeof value !== "string") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    throw new NumoBudgetReservationError(
      amount(reservation?.spent_usd), amount(reservation?.reserved_usd),
    );
  }
  if (!turn) throw new Error("Numo turn was not created");
  return hydrateNumoTurn(turn, input.userId);
}

const PERSISTED_EVENT_TYPES = new Set([
  "conversation_id",
  "content_delta",
  "reasoning_start",
  "reasoning_delta",
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

const DURABLE_ACTIVITY_FLUSH_MS = 250;

/** Persists replay-safe activity while forwarding the lower-latency live feed. */
export function createDurableNumoEmitter(
  service: SupabaseClient,
  turnId: string,
  live?: SafeEmitter,
  userId?: string,
): DurableEmitter {
  let pendingContent = "";
  // Reasoning deltas are snapshots of the trace so far, not increments: only
  // the LATEST one is worth persisting, and the journal replays it before
  // `reasoning_end` re-states the final text.
  let pendingReasoning: string | null = null;
  let chain = Promise.resolve();
  let closed = false;
  let terminal = false;
  let activityTimer: ReturnType<typeof setTimeout> | null = null;
  const enqueue = (operation: () => Promise<void>) => {
    chain = chain.then(operation).catch(() => {
      // Activity is a replay projection. The durable turn checkpoint remains the
      // authority, so a journal outage must not strand an otherwise valid turn.
      console.error("[numo-turn] activity_append_failed");
    });
  };

  const append = (type: string, payload: unknown) => {
    if (!PERSISTED_EVENT_TYPES.has(type)) return;
    enqueue(async () => {
      const eventId = randomUUID();
      const clear = payload ?? {};
      if (!clear || typeof clear !== "object" || Array.isArray(clear)) {
        throw new Error("Invalid Numo activity payload");
      }
      let stored = clear as Record<string, unknown>;
      if (await shouldProtectNumoTurnEvents(service)) {
        let owner = userId;
        if (!owner) {
          const turn = await service.from("numo_assistant_turns").select("user_id")
            .eq("id", turnId).maybeSingle();
          if (turn.error || !turn.data?.user_id) {
            throw new Error("Numo activity owner is unavailable");
          }
          owner = turn.data.user_id as string;
        }
        stored = await encodeNumoTurnEvent(owner, turnId, eventId, stored);
      }
      const { error } = await service.rpc("append_numo_turn_event", {
        p_turn_id: turnId,
        p_event_id: eventId,
        p_type: type,
        p_payload: stored,
      });
      if (error) throw new Error(`Numo activity append failed: ${error.message}`);
    });
  };
  const flushContent = () => {
    if (!pendingContent) return;
    const delta = pendingContent;
    pendingContent = "";
    append("content_delta", { delta });
  };

  const flushReasoning = () => {
    if (pendingReasoning === null) return;
    const text = pendingReasoning;
    pendingReasoning = null;
    append("reasoning_delta", { text });
  };

  const flushActivity = () => {
    if (activityTimer) clearTimeout(activityTimer);
    activityTimer = null;
    flushContent();
    flushReasoning();
  };
  const scheduleActivity = () => {
    if (activityTimer || closed || terminal) return;
    // Reconnected readers follow the durable journal rather than the original
    // HTTP stream. Publish partial output while the provider is still running.
    activityTimer = setTimeout(flushActivity, DURABLE_ACTIVITY_FLUSH_MS);
  };

  return {
    emit(event, data) {
      if (closed || terminal) return;
      live?.emit(event, data);
      if (event === "content_delta") {
        const delta = (data as { delta?: unknown } | null)?.delta;
        if (typeof delta === "string" && delta) {
          pendingContent += delta;
          scheduleActivity();
        }
        return;
      }
      if (event === "reasoning_delta") {
        const text = (data as { text?: unknown } | null)?.text;
        if (typeof text === "string") {
          pendingReasoning = text;
          scheduleActivity();
        }
        return;
      }
      if (event === "reasoning_tick" || event === "tool_result") return;
      flushActivity();
      append(event, data);
      if (event === "done" || event === "error") terminal = true;
    },
    close() {
      if (closed) return;
      flushActivity();
      closed = true;
      live?.close();
    },
    get isClosed() {
      return closed || live?.isClosed === true;
    },
    async flush() {
      flushActivity();
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
}): Promise<{
  messages: ChatMessage[];
  tools: AssistantToolDef[];
}> {
  const { turn, readClient, service, runtime } = input;
  const intent = turn.intent;
  let systemPrompt: string;
  // Re-read on every execution, so a deferred or retried turn uses the role
  // the user has NOW (MIN-693).
  let readerAccess: { canComment: boolean } | null = null;
  if (intent.documentation) {
    systemPrompt = await buildDocumentationHelpPrompt(intent.locale, intent.documentation.articleId, intent.documentation.selfHosting);
  } else if (intent.projectId) {
    const access = await getProjectAccess(turn.user_id, intent.projectId);
    if (!access) throw new Error("The attached project is no longer accessible");
    const promptProject = await gatherProjectPromptContext({
      supabase: readClient,
      service,
      project: access.project,
    });
    systemPrompt = buildSystemPrompt(promptProject, intent.locale, intent.numoDefaultStatus);
    if (access.role === "reader") {
      readerAccess = { canComment: access.canComment };
      systemPrompt += `\n## Access
- The user is a Reader in this project: it is read-only for them${access.canComment ? ", except for comments" : ""}. Do not offer changes to it; tools that would change it are refused.`;
    }
  } else {
    systemPrompt = buildGlobalSystemPrompt(intent.locale, intent.numoDefaultStatus);
  }
  if (intent.timezone) systemPrompt += buildClockBlock(intent.timezone);
  if (intent.routineId) {
    const timing = intent.routineOrigin === "scheduled"
      ? `scheduled for ${intent.routineScheduledFor ?? "an unspecified time"}`
      : intent.routineProvenance ? `triggered by ${intent.routineProvenance.subjectType} ${intent.routineProvenance.subjectId} (event ${intent.routineProvenance.eventId})` : "started manually";
    systemPrompt += `\n## Routine occurrence
- This is one occurrence of routine ${intent.routineId}, ${timing}. The owner is not assumed to be watching the first response.
- Complete the routine instruction as a Numo conversation, using Minddy tools directly for triage, cycle, reporting, wiki, project, or other product work. You cannot change a repository; when the instruction asks for code work, say so in the occurrence result.
- If a real decision or missing fact requires the owner, use ask_user. Leave the occurrence visibly waiting for input instead of guessing or failing silently.`;
  }

  const { data, error } = await service
    .from("assistant_messages")
    .select("turn_id, role, content, tool_calls, tool_call_id, tool_name, metadata, context, created_at, id")
    .eq("conversation_id", turn.conversation_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const recentHistory = (await hydrateNumoToolMessages(service,
    await hydrateNumoFinalMessages(service,
      await hydrateNumoUserMessages(service,
        (data ?? []) as StoredMessage[], turn.user_id), turn.user_id),
    turn.user_id)).reverse();
  // The bounded window can begin inside an older parallel tool batch. OpenAI
  // rejects a tool result without its preceding assistant call, so start at the
  // first complete message boundary instead of sending a malformed history.
  const firstCompleteMessage = recentHistory.findIndex((message) => message.role !== "tool");
  const history = firstCompleteMessage < 0 ? [] : recentHistory.slice(firstCompleteMessage);
  const historySkillNotes = await authorizedSkillsNotes(
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
  const rowAttachments = (
    message: StoredMessage,
  ): Array<AttachmentInput | PromptAttachment> => {
    if (message.role !== "user") return [];
    const raw = (message.metadata as { attachments?: unknown } | null)?.attachments;
    return Array.isArray(raw) ? raw as Array<AttachmentInput | PromptAttachment> : [];
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
  let tools: AssistantToolDef[] = CONVERSATION_ASSISTANT_TOOLS;
  if (!intent.webSearchEnabled) tools = withoutWebSearch(tools);
  if (intent.documentation) tools = CONVERSATION_ASSISTANT_TOOLS.filter(tool => tool.function.name === "get_help");
  // An @Numo mention runs on the shared surface of this one project: a
  // reader's mention is offered read tools only (plus comments when allowed).
  // Chat conversations stay cross-project, so there the per-call gate in
  // executeTool refuses writes in read-only projects.
  else if (readerAccess && intent.triggerSource === "mention") {
    tools = readerToolSet(tools, readerAccess.canComment);
  }
  return { messages, tools };
}

function createToolLedger(
  service: SupabaseClient,
  turnId: string,
  claimToken: string,
  userId: string,
): ToolExecutionLedger {
  return {
    async claim(input) {
      const protect = await shouldProtectNumoToolContent(service);
      const encoded = protect ? await encodeNumoToolOperationValue(userId,
        turnId, input.toolCallId, "arguments", input.args) : null;
      const { data, error } = protect
        ? await service.rpc("claim_numo_tool_operation_protected", {
            p_turn_id: turnId, p_claim_token: claimToken,
            p_tool_call_id: input.toolCallId, p_tool_name: input.toolName,
            p_arguments: encoded!.value,
            p_arguments_version: encoded!.version,
            p_arguments_digest: await numoToolArgumentsDigest(userId, input.args),
            p_replay_policy: input.replayPolicy,
          })
        : await service.rpc("claim_numo_tool_operation", {
            p_turn_id: turnId, p_claim_token: claimToken,
            p_tool_call_id: input.toolCallId, p_tool_name: input.toolName,
            p_arguments: input.args, p_replay_policy: input.replayPolicy,
          });
      if (error) throw new Error(error.message);
      const result = data as {
        action?: "execute" | "reuse" | "reconcile" | "lost_claim";
        success?: boolean;
        result?: unknown;
        model_result?: unknown;
        result_version?: number;
        model_result_version?: number;
        pause?: boolean;
      } | null;
      if (result?.action === "reuse") {
        const execution: ToolExecution = {
          success: result.success === true,
          result: await decodeNumoToolOperationValue(userId, turnId,
            input.toolCallId, "result", result.result,
            result.result_version ?? 0),
          modelResult: await decodeNumoToolOperationValue(userId, turnId,
            input.toolCallId, "model_result", result.model_result,
            result.model_result_version ?? 0),
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
      const protect = await shouldProtectNumoToolContent(service);
      const [sealedResult, sealedModel] = protect ? await Promise.all([
        encodeNumoToolOperationValue(userId, turnId, input.toolCallId,
          "result", input.result ?? null),
        encodeNumoToolOperationValue(userId, turnId, input.toolCallId,
          "model_result", input.modelResult ?? null),
      ]) : [null, null];
      const { data, error } = protect
        ? await service.rpc("complete_numo_tool_operation_protected", {
            p_turn_id: turnId, p_claim_token: claimToken,
            p_tool_call_id: input.toolCallId, p_success: input.success,
            p_result: sealedResult!.value,
            p_result_version: sealedResult!.version,
            p_model_result: sealedModel!.value,
            p_model_result_version: sealedModel!.version,
            p_pause: input.pause,
          })
        : await service.rpc("complete_numo_tool_operation", {
            p_turn_id: turnId, p_claim_token: claimToken,
            p_tool_call_id: input.toolCallId, p_success: input.success,
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
  errorMessage?: string | null;
  outcome?: string | null;
  userId?: string;
  costUsd?: number | null;
}): Promise<NumoTurn> {
  let errorMessage = input.errorMessage ?? null;
  let conversationErrorMessage = errorMessage;
  if (errorMessage && await shouldProtectNumoErrors(input.service)) {
    const { data: scope, error: scopeError } = await input.service
      .from("numo_assistant_turns").select("user_id,conversation_id")
      .eq("id", input.turnId).single();
    if (scopeError || !scope?.user_id || !scope.conversation_id ||
        input.userId && input.userId !== scope.user_id) {
      throw new Error("Unable to resolve Numo error scope");
    }
    [errorMessage, conversationErrorMessage] = await Promise.all([
      encodeNumoError(scope.user_id, "numo_assistant_turns", input.turnId,
        errorMessage),
      encodeNumoError(scope.user_id, "conversations", scope.conversation_id,
        errorMessage),
    ]);
  }
  const { data, error } = await input.service.rpc("checkpoint_numo_turn", {
    p_turn_id: input.turnId,
    p_claim_token: input.claimToken,
    p_status: input.status,
    p_checkpoint: input.checkpoint &&
      (input.checkpoint.phase === "model" || input.checkpoint.phase === "tools") &&
      await shouldProtectNumoToolContent(input.service)
      ? await encodeNumoCheckpoint(input.userId ?? (await input.service
          .from("numo_assistant_turns").select("user_id")
          .eq("id", input.turnId).single()).data?.user_id ?? "",
        input.turnId, input.checkpoint)
      : input.checkpoint ?? {},
    p_error_message: errorMessage,
    p_conversation_error_message: conversationErrorMessage,
    p_outcome: input.outcome != null &&
      await shouldProtectNumoFinalContent(input.service)
      ? await encodeNumoTurnOutcome(input.userId ?? "", input.turnId, input.outcome)
      : input.outcome ?? null,
    p_cost_usd: input.costUsd ?? null,
  });
  if (error) throw new Error(error.message);
  const turn = compositeRow<NumoTurn>(data);
  if (!turn) throw new NumoClaimLostError();
  return hydrateNumoTurn(turn);
}

// In-process stop registry: the stop POST (turn route / automations) runs in
// the same Node process as the executing turn most of the time, so a stop can
// be delivered as an event instead of waiting for the next `stopRequested`
// poll. Map value = the notifier registered by the executing turn; multi-pod
// deployments keep the DB read as the eventual backstop.
const turnStopSignals = new Map<string, () => void>();

function signalLocalTurnStop(turnId: string): boolean {
  const notify = turnStopSignals.get(turnId);
  if (!notify) return false;
  notify();
  return true;
}

export function signalNumoTurnStopInProcess(turnId: string): boolean {
  return signalLocalTurnStop(turnId);
}

async function stopRequested(service: SupabaseClient, turnId: string, claimToken: string) {
  const { data, error } = await service.from("numo_assistant_turns")
    .select("status").eq("id", turnId).eq("claim_token", claimToken).maybeSingle();
  if (error) throw new Error("Unable to read Numo execution authority");
  // A stolen/cleared claim must stop its old provider request too.
  return !data || (data as { status?: string }).status !== "running";
}

async function saveFinalMessage(input: {
  service: SupabaseClient;
  turnId: string;
  conversationId: string;
  userId: string;
  content: string | null;
  reasoning: unknown;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const { data: existing } = await input.service.from("assistant_messages")
    .select("id").eq("turn_id", input.turnId).eq("role", "assistant")
    .is("tool_calls", null).eq("tool_payload_version", 0).maybeSingle();
  if (existing?.id) return existing.id as string;
  const messageId = randomUUID();
  const stored = await shouldProtectNumoFinalContent(input.service)
    ? await encodeNumoFinalMessage(input.userId, messageId, {
        content: input.content, context: null,
        metadata: { ...(input.reasoning ? { reasoning: input.reasoning } : {}),
          ...input.metadata }, tool_call_id: null, tool_name: null,
      }) : null;
  const { data, error } = await input.service.from("assistant_messages").insert({
    id: messageId,
    conversation_id: input.conversationId,
    turn_id: input.turnId,
    role: "assistant",
    content: stored?.content ?? input.content,
    metadata: stored ? {} : {
      ...(input.reasoning ? { reasoning: input.reasoning } : {}),
      ...input.metadata,
    },
    ...(stored ? { final_payload_version: stored.final_payload_version } : {}),
  }).select("id").single();
  if (error?.code === "23505") {
    const { data: raced, error: reloadError } = await input.service
      .from("assistant_messages").select("id")
      .eq("turn_id", input.turnId).eq("role", "assistant")
      .is("tool_calls", null).eq("tool_payload_version", 0).maybeSingle();
    if (reloadError || !raced?.id) {
      throw new Error(reloadError?.message ?? error.message);
    }
    return raced.id as string;
  }
  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

/**
 * OpenRouter refused the account's own key at its cap (MIN-761): the turn ends
 * the way the pre-flight ends it, never on the provider's error.
 */
async function providerCapExhausted(turn: NumoTurn): Promise<NumoUsageExhaustedError> {
  const usage = await getUserUsage(turn.user_id).catch(() => null);
  return new NumoUsageExhaustedError({
    cause: "account",
    percent: 100,
    resetsAt: usage?.period.end ?? null,
    nextPlanId: usage ? nextBillingPlanId(usage.billing.plan.id) : null,
    byok: false,
    routineId: turn.intent.routineId ?? null,
  });
}

async function ensureNumoOperationBudget(
  turn: NumoTurn,
  runtime: ResolvedAiRuntime,
): Promise<void> {
  if (!isManagedAiEnabled()) return;

  let usage: Awaited<ReturnType<typeof getUserUsage>> | null = null;
  if (runtime.mode === "platform") {
    usage = await getUserUsage(turn.user_id);
    const included = usage.billing.plan.includedUsageUsd;
    if (usage.usedUsd >= included) {
      throw new NumoUsageExhaustedError({
        cause: "account",
        percent: 100,
        resetsAt: usage.period.end,
        nextPlanId: nextBillingPlanId(usage.billing.plan.id),
        byok: false,
        routineId: turn.intent.routineId ?? null,
      });
    }
  }

  const operationCap = turn.intent.operationBudgetUsd;
  const spent = operationCap == null ? null : await spentFromNumoOperation(turn.id);
  // Ledger reads fail open, like the existing account budget checks.
  if (operationCap == null || spent == null || spent < operationCap) {
    if (runtime.mode === "platform" && turn.managed_budget_usd != null) {
      const platformSpent = await spentFromNumoOperationPlatform(turn.id);
      if (platformSpent == null) throw new Error("Numo reservation usage could not be read");
      if (platformSpent >= Number(turn.managed_budget_usd)) {
        throw new NumoUsageExhaustedError({
          cause: "operation_allocation", percent: 0, resetsAt: null,
          nextPlanId: null, byok: false, routineId: turn.intent.routineId ?? null,
        });
      }
    }
    return;
  }
  usage ??= await getUserUsage(turn.user_id);
  const derivedPercent = usage.billing.plan.includedUsageUsd > 0
    ? Math.round((operationCap / usage.billing.plan.includedUsageUsd) * 100)
    : 100;
  throw new NumoUsageExhaustedError({
    cause: "routine_cap",
    percent: turn.intent.operationBudgetPercent ?? derivedPercent,
    resetsAt: usage.period.end,
    nextPlanId: null,
    byok: runtime.mode === "byok",
    routineId: turn.intent.routineId ?? null,
  });
}

async function executeNumoTurnCore(input: {
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
  const claimedRow = compositeRow<NumoTurn>(claimedData);
  if (!claimedRow) return { status: "not_claimed" };
  const claimed = await hydrateNumoTurn(claimedRow);
  // A stop asked while this very process executes the turn must reach the
  // running LLM loop as an event, not on the next 1 s `stopRequested` poll.
  // The DB `stopping` status stays the cross-instance authority: the local
  // flag only shortens the path when the stop POST lands in this process.
  let localStopRequested = false;
  const signalLocalStop = () => { localStopRequested = true; };
  turnStopSignals.set(claimed.id, signalLocalStop);
  try {
    return await executeClaimedNumoTurn({
      turnId: input.turnId,
      turn: claimed,
      claimToken,
      readClient: input.readClient,
      liveEmitter: input.liveEmitter,
      aiRuntime: input.aiRuntime,
      allowRetryable: input.allowRetryable === true,
      isStopRequestedLocally: () => localStopRequested,
      signalLocalStop,
    });
  } finally {
    turnStopSignals.delete(claimed.id);
  }
}

async function executeClaimedNumoTurn(input: {
  turnId: string;
  turn: NumoTurn;
  claimToken: string;
  readClient?: SupabaseClient;
  liveEmitter?: SafeEmitter;
  aiRuntime?: ResolvedAiRuntime;
  allowRetryable?: boolean;
  isStopRequestedLocally: () => boolean;
  signalLocalStop: () => void;
}): Promise<ExecuteNumoTurnResult> {
  const service = getServiceClient();
  const claimToken = input.claimToken;
  const claimed = input.turn;
  const executionStartedAt = performance.now();
  let latestCheckpoint = claimed.checkpoint;

  const emitter = createDurableNumoEmitter(service, claimed.id, input.liveEmitter,
    claimed.user_id);
  emitter.emit("conversation_id", { conversationId: claimed.conversation_id, turnId: claimed.id });
  const firstFinal = await service.from("assistant_messages")
    .select("id,content,context,metadata,tool_call_id,tool_name,final_payload_version")
    .eq("turn_id", claimed.id)
    .eq("role", "assistant")
    .is("tool_calls", null)
    .eq("tool_payload_version", 0)
    .maybeSingle();
  const { data: savedFinal, error: savedFinalError } = firstFinal.error &&
      ["42703", "PGRST204"].includes(firstFinal.error.code)
    ? await service.from("assistant_messages")
        .select("id,content,context,metadata,tool_call_id,tool_name")
        .eq("turn_id", claimed.id).eq("role", "assistant")
        .is("tool_calls", null).maybeSingle()
    : firstFinal;
  if (savedFinalError) throw new Error("Unable to read saved Numo answer");
  if (savedFinal?.id) {
    const readableFinal = await decodeNumoFinalMessage(claimed.user_id,
      savedFinal as { id: string; content: string | null;
        context: unknown; metadata: unknown;
        tool_call_id: string | null; tool_name: string | null;
        final_payload_version?: number });
    const turn = await checkpointTurn({
      service,
      turnId: claimed.id,
      claimToken,
      status: "completed",
      checkpoint: { phase: "done" },
      outcome: typeof readableFinal.content === "string" ? readableFinal.content : null,
      userId: claimed.user_id,
    });
    emitter.emit("message_complete", { message_id: savedFinal.id });
    emitter.emit("done", { status: "completed" });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  }
  if (!input.readClient) {
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
    const resolvedRuntime = input.aiRuntime ?? await resolveAiRuntime({
      userId: claimed.user_id,
      modelKey: "assistant_model",
      surface: "assistant",
      modelOverride: claimed.model,
      ...(claimed.intent.documentation ? { managedOnly: true } : {}),
    });
    // The turn row is the admission-time authority. A queued or recovered
    // turn must not pick up a later conversation setting, and an immediate
    // request must use the same frozen model as its durable record.
    const runtime = claimed.model && claimed.model !== resolvedRuntime.model
      ? { ...resolvedRuntime, model: claimed.model }
      : resolvedRuntime;
    const readClient = input.readClient ?? service;
    const execution = await buildExecutionInput({
      turn: claimed,
      readClient,
      service,
      runtime,
    });
    console.info("[numo-chat] timing", { requestId: claimed.request_id,
      phase: "execution_prepared", executionElapsedMs: Math.round(performance.now() - executionStartedAt) });
    const result = await withRoutineCause(claimed.intent.routineId ?? null, () => processChat(execution.messages, execution.tools, emitter, {
      projectId: claimed.intent.projectId,
      documentationHelp: !!claimed.intent.documentation,
      requireExplicitProjectTarget: true,
      userId: claimed.user_id,
      supabase: readClient,
      service,
      locale: claimed.intent.locale,
      timezone: claimed.intent.timezone,
      numoDefaultStatus: claimed.intent.numoDefaultStatus,
      model: runtime.model,
      aiRuntime: runtime,
      conversationId: claimed.conversation_id,
      reasoningLevel: claimed.reasoning_level ?? undefined,
      webSearch: claimed.intent.webSearchEnabled
        ? { runId: claimed.run_id, used: 0 }
        : undefined,
      turnId: claimed.id,
      operationBudgetUsd: claimed.intent.operationBudgetUsd ?? null,
      operationBudgetPercent: claimed.intent.operationBudgetPercent ?? null,
      routineId: claimed.intent.routineId ?? null,
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
        });
        latestCheckpoint = persisted.checkpoint;
      },
      persistToolRound: async (toolRound) => {
        const protect = await shouldProtectNumoToolContent(service);
        const messageId = randomUUID();
        const payload = protect ? await encodeNumoToolMessage(
          claimed.user_id, messageId, {
            role: "assistant", content: toolRound.assistantContent,
            tool_calls: toolRound.pendingToolCalls, context: null,
            metadata: toolRound.assistantReasoning
              ? { reasoning: toolRound.assistantReasoning } : {},
          }) : null;
        const checkpoint = protect ? await encodeNumoCheckpoint(
          claimed.user_id, claimed.id, {
            phase: "tools", assistantContent: toolRound.assistantContent,
            assistantReasoning: toolRound.assistantReasoning,
            assistantMessageId: messageId,
            pendingToolCalls: toolRound.pendingToolCalls,
            completedToolCallIds: [], roundCount: toolRound.roundCount,
            completionRepairs: toolRound.completionRepairs ?? 0,
          }) : null;
        const { data, error } = protect
          ? await service.rpc("checkpoint_numo_tool_round_protected", {
              p_turn_id: claimed.id, p_claim_token: claimToken,
              p_message_id: messageId,p_content: payload!.content,
              p_payload_version: payload!.tool_payload_version,
              p_checkpoint: checkpoint,p_round_count: toolRound.roundCount,
            })
          : await service.rpc("checkpoint_numo_tool_round", {
              p_turn_id: claimed.id,
              p_claim_token: claimToken,
              p_content: toolRound.assistantContent,
              p_tool_calls: toolRound.pendingToolCalls,
              p_reasoning: toolRound.assistantReasoning,
              p_round_count: toolRound.roundCount,
            });
        if (error) throw new Error(error.message);
        const persistedRow = compositeRow<NumoTurn>(data);
        const persisted = persistedRow ? await hydrateNumoTurn(persistedRow) : null;
        if (!persisted) throw new NumoClaimLostError();
        latestCheckpoint = persisted.checkpoint;
        const persistedMessageId = persisted.checkpoint?.phase === "tools"
          ? persisted.checkpoint.assistantMessageId
          : null;
        if (!persistedMessageId) throw new Error("Assistant tool round checkpoint is incomplete");
        return persistedMessageId;
      },
      toolLedger: createToolLedger(service, claimed.id, claimToken,
        claimed.user_id),
      shouldStop: async () =>
        input.isStopRequestedLocally() || await stopRequested(service, claimed.id, claimToken),
      onStopSignal: (notify) => {
        // The registry entry already flips the local flag on a stop; the
        // contributor above re-registers this exact callback so an event stop
        // also unblocks a pending stream read. The registry value is replaced,
        // not stacked: only the live execution of this turn listens.
        const signal = () => {
          // Keep the turn-level latch set between generation rounds and tools.
          input.signalLocalStop();
          notify();
        };
        turnStopSignals.set(claimed.id, signal);
        return () => {
          if (turnStopSignals.get(claimed.id) === signal) {
            turnStopSignals.set(claimed.id, input.signalLocalStop);
          }
        };
      },
      beforeGeneration: async (roundCount) => {
        await ensureNumoOperationBudget(claimed, runtime);
        console.info("[numo-chat] timing", { requestId: claimed.request_id,
          phase: "generation_ready", roundCount,
          executionElapsedMs: Math.round(performance.now() - executionStartedAt) });
      },
      onGeneration: async (generation, roundCount) => {
        await recordAiUsage({
          runId: claimed.run_id,
          seq: Math.max(0, claimed.attempts - 1) * 100 + roundCount,
          feature: claimed.intent.routineId ? "routine_code" : "numo_chat",
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
          numoTurnId: claimed.id,
          routineId: claimed.intent.routineId ?? null,
        });
      },
    }), claimed.intent.routineProvenance?.causeRoutineIds ?? []);

    if (input.isStopRequestedLocally() || await stopRequested(service, claimed.id, claimToken)) {
      const turn = await checkpointTurn({
        service,
        turnId: claimed.id,
        claimToken,
        status: "stopped",
        checkpoint: checkpointRecord(latestCheckpoint),
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
        userId: claimed.user_id,
        content: result.fullContent,
        reasoning: result.finalReasoning,
      });
      if (messageId) emitter.emit("message_complete", { message_id: messageId });
    }

    const checkpoint = result.suspension?.kind === "input"
      ? { phase: "user_wait" }
      : { phase: "done" };
    const status: NumoTurnStatus = result.suspension?.kind === "input"
      ? "waiting_input"
      : "completed";
    const recordedOperationCost = await spentFromNumoOperation(claimed.id);
    const fallbackCostUsd = result.generations.reduce(
      (total, generation) => total + Math.max(0, generation.cost ?? 0),
      claimed.cost_usd,
    );
    const turn = await checkpointTurn({
      service,
      turnId: claimed.id,
      claimToken,
      status,
      checkpoint,
      outcome: result.fullContent || null,
      userId: claimed.user_id,
      costUsd: recordedOperationCost ?? fallbackCostUsd,
    });
    emitter.emit("done", { status });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  } catch (caught) {
    const error = isPlanLimitError(caught) && caught.code === "usage_budget_exceeded"
      ? await providerCapExhausted(claimed)
      : caught;
    if (error instanceof NumoUsageExhaustedError) {
      const messageId = await saveFinalMessage({
        service,
        turnId: claimed.id,
        conversationId: claimed.conversation_id,
        userId: claimed.user_id,
        content: null,
        reasoning: null,
        metadata: { usage_exhausted: error.details },
      });
      const spent = await spentFromNumoOperation(claimed.id);
      const turn = await checkpointTurn({
        service,
        turnId: claimed.id,
        claimToken,
        status: "completed",
        checkpoint: { phase: "done" },
        outcome: null,
        costUsd: spent ?? claimed.cost_usd,
      });
      if (messageId) emitter.emit("message_complete", { message_id: messageId });
      emitter.emit("done", { status: "completed" });
      await emitter.flush();
      emitter.close();
      return { status: turn.status, turn };
    }
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
      return { status: "reconciling", turn: await hydrateNumoTurn(data as NumoTurn) };
    }
    if (error instanceof NumoClaimLostError) {
      const { data } = await service.from("numo_assistant_turns").select("*")
        .eq("id", claimed.id).single();
      const current = data ? await hydrateNumoTurn(data as NumoTurn) : null;
      if (!current) {
        emitter.close();
        return { status: "not_claimed" };
      }
      if (current?.status === "stopping" && current.claim_token === claimToken) {
        const stopped = await checkpointTurn({
          service,
          turnId: claimed.id,
          claimToken,
          status: "stopped",
          checkpoint: checkpointRecord(current.checkpoint),
        });
        emitter.emit("done", { status: "stopped" });
        await emitter.flush();
        emitter.close();
        return { status: stopped.status, turn: stopped };
      }
      emitter.emit("done", { status: current.status });
      await emitter.flush();
      emitter.close();
      return { status: current.status, turn: current };
    }

    const message = error instanceof NumoCompletionError ? error.message : "Numo turn failed";
    const status: "retryable" | "failed" = error instanceof NumoCompletionError
      ? "failed" : claimed.attempts < 3 ? "retryable" : "failed";
    const { data: currentClaim, error: currentClaimError } = await service
      .from("numo_assistant_turns")
      .select("checkpoint")
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
    const storedFailureCheckpoint = (currentClaim as
      { checkpoint?: NumoTurnCheckpoint } | null)?.checkpoint;
    const failureCheckpoint = storedFailureCheckpoint
      ? await decodeNumoCheckpoint(claimed.user_id, claimed.id,
          storedFailureCheckpoint as unknown as Record<string, unknown>) as
          unknown as NumoTurnCheckpoint
      : latestCheckpoint;
    let turn: NumoTurn;
    try {
      turn = await checkpointTurn({
        service,
        turnId: claimed.id,
        claimToken,
        status,
        checkpoint: checkpointRecord(failureCheckpoint),
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
      turn = await hydrateNumoTurn(data as NumoTurn);
      if (turn.status === "stopping" && turn.claim_token === claimToken) {
        turn = await checkpointTurn({
          service,
          turnId: claimed.id,
          claimToken,
          status: "stopped",
          checkpoint: checkpointRecord(turn.checkpoint),
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

/** Execute one durable turn and keep any shared comment projection in sync. */
export async function executeNumoTurn(input: {
  turnId: string;
  readClient?: SupabaseClient;
  liveEmitter?: SafeEmitter;
  aiRuntime?: ResolvedAiRuntime;
  allowRetryable?: boolean;
}): Promise<ExecuteNumoTurnResult> {
  const service = getServiceClient();
  try {
    const result = await executeNumoTurnCore({
      ...input,
      liveEmitter: await withNumoSurfaceEmitter(
        service,
        input.turnId,
        input.liveEmitter,
      ),
    });
    if (result.status !== "not_claimed") {
      await projectNumoSurfaceTurn(service, result.turn);
      notifyRoutineOfNumoTurn(result.turn);
    }
    return result;
  } catch (error) {
    await failNumoSurfaceProjection(service, input.turnId);
    throw error;
  }
}

export async function requestNumoTurnStop(conversationId: string, userId: string) {
  const service = getServiceClient();
  const { data, error } = await service.from("numo_assistant_turns")
    .select("request_id").eq("conversation_id", conversationId).eq("user_id", userId)
    .in("status", ["queued", "running", "stopping", "waiting_input", "retryable", "reconciling"])
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const stopped = await requestNumoRequestStop({
    conversationId, userId, requestId: data.request_id as string,
  });
  const { data: turn, error: readError } = await service.from("numo_assistant_turns")
    .select("*").eq("id", stopped.id).eq("user_id", userId).single();
  if (readError || !turn) throw new Error("Unable to read stopped Numo turn");
  return hydrateNumoTurn(turn as NumoTurn, userId);
}

/** Stop the exact browser request, including one whose admission has not finished. */
export async function requestNumoRequestStop(input: {
  conversationId: string;
  requestId: string;
  userId: string;
  stopStartedAt?: number;
}): Promise<{ id: string; status: NumoTurnStatus }> {
  const service = getServiceClient();
  const stopStartedAt = input.stopStartedAt ?? performance.now();
  const timing = (phase: string) => console.info("[numo-stop] timing", {
    requestId: input.requestId, phase, elapsedMs: Math.round(performance.now() - stopStartedAt),
  });
  // Projection work must not delay the authority write that aborts execution.
  const conversationVersionRead = Promise.resolve(service.from("conversations")
    .select("updated_at").eq("id", input.conversationId).eq("user_id", input.userId).maybeSingle())
    .catch(() => ({ data: null, error: { message: "Unable to read Numo conversation version" } }));
  const retire = async () => {
    const { data, error } = await service
      .from("numo_assistant_turns").update({
        status: "stopped", claim_token: null, claimed_at: null,
        completed_at: new Date().toISOString(), error_message: null,
        updated_at: new Date().toISOString(),
      }).eq("conversation_id", input.conversationId).eq("user_id", input.userId)
      .eq("request_id", input.requestId)
      .in("status", ["queued", "running", "stopping", "waiting_input", "retryable", "reconciling"])
      .select("id,status").maybeSingle();
    if (error) throw new Error("Unable to retire Numo execution authority");
    if (data) {
      signalLocalTurnStop(data.id as string);
      timing("execution_revoked");
    }
    return data as { id: string; status: NumoTurnStatus } | null;
  };
  let turn = await retire();
  if (!turn) {
    const { data, error } = await service.from("numo_assistant_turns")
      .select("id,status").eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId).eq("request_id", input.requestId).maybeSingle();
    if (error) throw new Error("Numo request is unavailable");
    turn = data as { id: string; status: NumoTurnStatus } | null;
    if (!turn) {
      // Only pre-admission cancellation needs a new, protected intent receipt.
      // Admission returns this request before reserving budget or saving a message.
      const intent = await shouldProtectNumoTurnIntent(service)
        ? await encodeNumoTurnIntent(input.userId, input.conversationId, input.requestId, {}) : {};
      const { data: receipt, error: insertError } = await service
        .from("numo_assistant_turns").insert({
          conversation_id: input.conversationId, user_id: input.userId,
          request_id: input.requestId, run_id: randomUUID(), status: "stopped",
          intent, completed_at: new Date().toISOString(),
        }).select("id,status").single();
      if (!insertError) return receipt as { id: string; status: NumoTurnStatus };
      if (insertError.code !== "23505") throw new Error("Unable to record Numo request stop");
      // Admission may have won between the miss and receipt insertion.
      turn = await retire();
      if (!turn) {
        const { data: existing, error: existingError } = await service.from("numo_assistant_turns")
          .select("id,status").eq("conversation_id", input.conversationId)
          .eq("user_id", input.userId).eq("request_id", input.requestId).single();
        if (existingError || !existing) throw new Error("Numo request is unavailable");
        turn = existing as { id: string; status: NumoTurnStatus };
      }
    }
  }
  if (turn.status !== "stopped") return turn;
  signalLocalTurnStop(turn.id);
  const { data: conversationVersion, error: versionError } = await conversationVersionRead;
  if (versionError) throw new Error("Unable to read Numo conversation version");
  if (conversationVersion?.updated_at) {
    const { data: newest, error: newestError } = await service.from("numo_assistant_turns")
      .select("id").eq("conversation_id", input.conversationId).eq("user_id", input.userId)
      .or("status.neq.stopped,model.not.is.null,attempts.gt.0")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
    if (newestError) throw new Error("Unable to read Numo conversation projection");
    if (newest?.id === turn.id) {
      // A new admission updates the conversation in its own transaction. The
      // version comparison prevents this old Stop from resetting its status.
      const { error } = await service.from("conversations").update({
        status: "idle", error_message: null, updated_at: new Date().toISOString(),
      }).eq("id", input.conversationId).eq("user_id", input.userId)
        .eq("updated_at", conversationVersion.updated_at);
      if (error) throw new Error("Unable to project stopped Numo conversation");
    }
  }
  console.info("[numo-stop] request recorded", {
    turnId: turn.id, requestId: input.requestId, status: turn.status,
  });
  timing("cleanup_done");
  return turn;
}

export async function retryNumoTurn(conversationId: string, userId: string) {
  const { data, error } = await getServiceClient().rpc("retry_numo_turn", {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const turn = compositeRow<NumoTurn>(data);
  return turn ? hydrateNumoTurn(turn, userId) : null;
}

export async function drainNumoTurns(options?: { limit?: number }) {
  const service = getServiceClient();
  const { recoverPendingRoutineOccurrences } = await import(
    "@/lib/server/routine-occurrences"
  );
  await recoverPendingRoutineOccurrences(options?.limit ?? 10);
  const { error: recoveryError } = await service.rpc("recover_stale_numo_turns");
  if (recoveryError) throw new Error(recoveryError.message);
  const { data, error } = await service.from("numo_assistant_turns")
    .select("id, status")
    .in("status", ["queued", "retryable"])
    .lte("not_before", new Date().toISOString())
    .order("not_before", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 10);
  if (error) throw new Error(error.message);
  let claimed = 0;
  for (const row of data ?? []) {
    // A `retryable` turn carries a checkpoint and waits on nobody: for a turn
    // started server-side (PR review, routine, automation) there is no
    // interactive client to press "Retry", so the drain is the only thing
    // that can resume it. The service client is passed as the read client on
    // purpose: without it, `executeNumoTurnCore` treats any resume as an
    // interrupted request and flips the turn straight back to
    // `retryable` without ever running it, leaving the claim to churn every
    // tick with `attempts` unbounded. The attempt ceiling still bounds a
    // poisoned turn once the real execution path records its failures.
    const result = await executeNumoTurn({
      turnId: row.id as string,
      readClient: service,
      ...(row.status === "retryable" ? { allowRetryable: true } : {}),
    });
    if (result.status !== "not_claimed") claimed++;
  }
  return { claimed };
}
