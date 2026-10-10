import "server-only";
import { hydrateWorkerParentCopies } from "@/lib/server/agent/worker-parent-content";

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
  AUTOMATION_WORKER_MEDIATION_ASSISTANT_TOOLS,
  AUTOMATION_ASSISTANT_TOOLS,
  CONVERSATION_ASSISTANT_TOOLS,
  WORKER_MEDIATION_ASSISTANT_TOOLS,
  type AssistantToolDef,
} from "@/lib/server/assistant/tools";
import type { WorkerInputCorrelation } from "@/lib/server/numo/worker-mediation";
import { workerHarnessContext } from "@/lib/server/assistant/worker-harness-context";
import { cancelStoppedTurnWorkerInputs } from "@/lib/server/numo/worker-mediation";
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
import { parseAgentDelegationResult } from "@/lib/server/agent/agent-contract";
import {
  deliverAgentDelegationResult,
  discardPendingWorkerMessages,
  getRun,
  notifyDelegatedAgentRun,
} from "@/lib/server/agent/runs";
import { withoutWebSearch } from "@/lib/server/web-search";
import { decodeWorkerEventPayload, encodeWorkerEventPayload } from "./worker-event-content";
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
import { notifyAutomationOfNumoTurn } from "@/lib/server/automations/numo-hooks";
import { notifyRoutineOfNumoTurn } from "@/lib/server/routine-hooks";

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
  /** Public help uses the same billing and durable lifecycle, with restricted tools. */
  documentation?: Omit<NonNullable<AssistantPageContext["documentation"]>, "locale">;
  projectId: string | null;
  locale: string;
  timezone: string;
  numoDefaultStatus: NumoDefaultStatus;
  webSearchEnabled: boolean;
  /** Preserve comment-origin semantics for delegated work and activity. */
  triggerSource?: "chat" | "mention";
  /** Routine operation identity; the turn id is the occurrence identity. */
  routineId?: string | null;
  routineOrigin?: "scheduled" | "manual" | null;
  routineScheduledFor?: string | null;
  /** Shared cap across parent generations and every delegated worker. */
  operationBudgetUsd?: number | null;
  /** User-facing percentage retained in the same unit as routine settings. */
  operationBudgetPercent?: number | null;
  /** Durable automation operation whose result is interpreted by this turn. */
  automation?: NumoAutomationContext | null;
}

export interface NumoAutomationContext {
  chainId: string;
  step: number;
  ruleId: string;
  preset: string | null;
  retries: number;
  mode: "plan" | "implement" | "verify" | "custom";
  issue: {
    id: string;
    identifier: string;
    title: string;
    plan: string | null;
  };
}

export type NumoTurnCheckpoint =
  | ProcessChatCheckpoint
  | { phase: "worker_wait"; active_run_id: string }
  | {
      phase: "worker_result";
      worker_event: { type: string; payload: Record<string, unknown> };
    }
  | {
      phase: "worker_input_wait";
      worker_event: { type: string; payload: Record<string, unknown> };
      input_request: WorkerInputCorrelation;
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

function workerDelegationResult(workerEvent: {
  type: string;
  payload: Record<string, unknown>;
}) {
  try {
    return parseAgentDelegationResult(workerEvent.payload.result);
  } catch {
    if (Object.hasOwn(workerEvent.payload, "result")) {
      return parseAgentDelegationResult({
        version: 1,
        status: "failed",
        summary: "The code worker ended without a valid structured result.",
        changedFiles: [],
        verificationPerformed: [],
        artifacts: [],
        unresolvedDecisions: ["The code worker returned an invalid structured result."],
      });
    }

    const status = workerEvent.payload.status;
    const awaitingInput = workerEvent.payload.awaiting_input === true;
    const outcome = typeof workerEvent.payload.outcome === "string"
      ? workerEvent.payload.outcome.trim()
      : "";
    const errorMessage = typeof workerEvent.payload.error_message === "string"
      ? workerEvent.payload.error_message.trim()
      : "";
    const prUrl = typeof workerEvent.payload.pr_url === "string"
      ? workerEvent.payload.pr_url.trim()
      : "";
    const prNumber = typeof workerEvent.payload.pr_number === "number"
      ? workerEvent.payload.pr_number
      : null;
    const failed = status === "failed" || status === "canceled"
      || workerEvent.type === "worker_failed";
    return parseAgentDelegationResult({
      version: 1,
      status: failed
        ? "failed"
        : awaitingInput || workerEvent.type === "worker_input"
          ? "needs_input"
          : errorMessage
            ? "partial"
            : "completed",
      summary: outcome || errorMessage || "The code worker ended without a summary.",
      changedFiles: [],
      verificationPerformed: [],
      artifacts: prUrl || prNumber != null
        ? [{
            kind: "pull_request",
            ref: prNumber != null ? `#${prNumber}` : prUrl,
            ...(prUrl ? { url: prUrl } : {}),
          }]
        : [],
      unresolvedDecisions: awaitingInput && outcome
        ? [outcome]
        : failed && errorMessage
          ? [errorMessage]
          : [],
    });
  }
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
  background: boolean;
}): Promise<{
  messages: ChatMessage[];
  tools: AssistantToolDef[];
  workerInput?: WorkerInputCorrelation;
}> {
  const { turn, readClient, service, runtime } = input;
  const intent = turn.intent;
  let systemPrompt: string;
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
  } else {
    systemPrompt = buildGlobalSystemPrompt(intent.locale, intent.numoDefaultStatus);
  }
  if (intent.timezone) systemPrompt += buildClockBlock(intent.timezone);
  if (intent.automation) {
    const operation = intent.automation;
    const plan = operation.issue.plan?.trim() || "(no implementation plan at admission)";
    systemPrompt += `\n## Automated chain operation
- This is step ${operation.step} of automation chain ${operation.chainId}; rule ${operation.ruleId}, mode ${operation.mode}, retry ${operation.retries}.
- The attached issue is ${operation.issue.identifier} — ${operation.issue.title} (id: ${operation.issue.id}).
- The implementation-plan snapshot at admission is:\n\n${plan}\n
- Complete the requested Numo operation yourself. Use Minddy tools directly when repository work is unnecessary. Delegate through launch_code_agent only when code or repository inspection is required.
- A delegated worker finishing is not the end of this operation. Interpret its structured result and any remaining work before concluding.
- Call report_automation_outcome exactly once as your final tool, after all direct actions and delegated work are resolved. Report failed when the requested result was not achieved or blockers remain. Direct user questions are intentionally unavailable in an automated step; delegated-worker input is mediated through the parent conversation, while deliberate human checkpoints remain owned by the chain.`;
  }
  if (intent.routineId) {
    const timing = intent.routineOrigin === "scheduled"
      ? `scheduled for ${intent.routineScheduledFor ?? "an unspecified time"}`
      : "started manually";
    systemPrompt += `\n## Routine occurrence
- This is one occurrence of routine ${intent.routineId}, ${timing}. The owner is not assumed to be watching the first response.
- Complete the routine instruction as a Numo conversation. Use Minddy tools directly for triage, cycle, reporting, wiki, project, or other product work that does not require a repository.
- Delegate with launch_code_agent only when repository inspection or code changes are actually necessary. The worker uses the owner's current Account code model; never ask for or choose a routine-specific worker model.
- If a real decision or missing fact requires the owner, use ask_user. Leave the occurrence visibly waiting for input instead of guessing or failing silently.
- When the instruction requests a pull request, set requires_pull_request: true and authorize manage_pull_request in the worker brief. Treat missing PR artifacts or partial worker results as incomplete delivery; finish the work or explain the concrete failure in the occurrence result.
- A delegated worker result is intermediate. Interpret it and finish the occurrence in this conversation.`;
  }

  const { data, error } = await service
    .from("assistant_messages")
    .select("turn_id, role, content, tool_calls, tool_call_id, tool_name, metadata, context, created_at, id")
    .eq("conversation_id", turn.conversation_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const recentHistory = (await hydrateWorkerParentCopies(service,
    await hydrateNumoToolMessages(service,
      await hydrateNumoFinalMessages(service,
        await hydrateNumoUserMessages(service,
          (data ?? []) as StoredMessage[], turn.user_id), turn.user_id),
      turn.user_id))).reverse();
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
  const workerEvent = turn.checkpoint?.phase === "worker_result"
    ? { ...turn.checkpoint.worker_event,
        payload: await decodeWorkerEventPayload(turn.checkpoint.worker_event.payload,
          turn.user_id, null, turn.active_run_id) }
    : null;
  let workerInput: WorkerInputCorrelation | undefined;
  if (workerEvent) {
    const durableResult = workerDelegationResult(workerEvent);
    const harness = workerHarnessContext({ agent_engine: workerEvent.payload.agent_engine });
    const request = durableResult.inputRequest;
    if (durableResult.status === "needs_input" && request) {
      workerInput = {
        parentTurnId: request.parentTurnId,
        runId: request.runId,
        questionId: request.questionId,
      };
    }
    messages.push({
      role: "system",
      content: workerInput
        ? `[Validated durable code-worker input request]\n${JSON.stringify(durableResult)}\n[Frozen worker harness]\n${JSON.stringify(harness)}\nYou alone mediate this worker's interaction with the user. If the parent conversation already determines a reliable answer, call answer_code_worker with the exact supplied identifiers and a self-contained answer. Otherwise call ask_user with the minimum blocking questions; never expose or refer the user to a separate worker conversation. Do not present this as the final result while the worker is waiting. Respect these frozen adapter capabilities; do not promise unavailable native built-ins, images or subagents.`
        : `[Validated durable code-worker result: ${workerEvent.type}]\n${JSON.stringify(durableResult)}\n[Frozen worker harness]\n${JSON.stringify(harness)}\nInterpret this result and answer the user's original request in this conversation. Report partial work, failure and unresolved decisions honestly. Do not tell the user to inspect another conversation for the answer. Respect these frozen adapter capabilities; do not promise unavailable native built-ins, images or subagents.`,
    });
  }

  let tools: AssistantToolDef[] = input.background
    ? workerInput
      ? intent.automation
        ? AUTOMATION_WORKER_MEDIATION_ASSISTANT_TOOLS
        : WORKER_MEDIATION_ASSISTANT_TOOLS
      : intent.automation ? AUTOMATION_ASSISTANT_TOOLS : []
    : intent.automation ? AUTOMATION_ASSISTANT_TOOLS : CONVERSATION_ASSISTANT_TOOLS;
  if (!intent.webSearchEnabled) tools = withoutWebSearch(tools);
  if (intent.documentation) tools = CONVERSATION_ASSISTANT_TOOLS.filter(tool => tool.function.name === "get_help");
  return { messages, tools, ...(workerInput ? { workerInput } : {}) };
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
      const runId = input.success && input.result &&
        typeof input.result === "object" && !Array.isArray(input.result) &&
        typeof (input.result as Record<string, unknown>).run_id === "string" &&
        /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(
          (input.result as Record<string, unknown>).run_id as string)
        ? (input.result as Record<string, unknown>).run_id as string : null;
      const { data, error } = protect
        ? await service.rpc("complete_numo_tool_operation_protected", {
            p_turn_id: turnId, p_claim_token: claimToken,
            p_tool_call_id: input.toolCallId, p_success: input.success,
            p_result: sealedResult!.value,
            p_result_version: sealedResult!.version,
            p_model_result: sealedModel!.value,
            p_model_result_version: sealedModel!.version,
            p_result_run_id: runId, p_pause: input.pause,
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
  activeRunId?: string | null;
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
    p_active_run_id: input.activeRunId ?? null,
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

/**
 * Stop EVERY live worker of a turn (MIN-599): the awaited run, but also any
 * other worker the turn left running (multi-launch tool round, relaunch race).
 * The turn is the ownership boundary, `parent_numo_turn_id` is the join — the
 * same cascade as the SQL stop RPC, for the in-process paths.
 */
async function interruptTurnWorkers(service: SupabaseClient, turnId: string) {
  const { data: authority, error: authorityError } = await service
    .from("numo_assistant_turns").select("status").eq("id", turnId).maybeSingle();
  if (authorityError) throw new Error("Unable to read Numo stop scope");
  // Individual worker stops retire the parent atomically. Global stops have
  // already cascaded in SQL; an executor with a revoked claim cannot widen it.
  if (!authority || authority.status === "stopped") return;
  const { error } = await service.from("agent_runs")
    .update({ interrupt_requested: true })
    .eq("parent_numo_turn_id", turnId)
    .in("status", ["queued", "running"]);
  if (error) {
    console.error("[numo-turn] worker_interrupt_failed", turnId);
  }
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
  // Ledger reads fail open, like the existing account and worker budget checks.
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
  let latestActiveRunId = claimed.active_run_id;

  const emitter = createDurableNumoEmitter(service, claimed.id, input.liveEmitter,
    claimed.user_id);
  emitter.emit("conversation_id", { conversationId: claimed.conversation_id, turnId: claimed.id });
  const background = claimed.checkpoint?.phase === "worker_result";
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
      background,
    });
    console.info("[numo-chat] timing", { requestId: claimed.request_id,
      phase: "execution_prepared", executionElapsedMs: Math.round(performance.now() - executionStartedAt) });
    const result = await processChat(execution.messages, execution.tools, emitter, {
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
      automationChainId: claimed.intent.automation?.chainId ?? null,
      triggerSource: claimed.intent.triggerSource ?? "chat",
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
      registerActiveRun: (runId) => {
        latestActiveRunId = runId;
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
      ...(execution.workerInput ? { workerInput: execution.workerInput } : {}),
    });

    if (input.isStopRequestedLocally() || await stopRequested(service, claimed.id, claimToken)) {
      const activeRunId = result.suspension?.kind === "work"
        ? result.suspension.runId
        : claimed.active_run_id;
      await interruptTurnWorkers(service, claimed.id);
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
        userId: claimed.user_id,
        content: result.fullContent,
        reasoning: result.finalReasoning,
      });
      if (messageId) emitter.emit("message_complete", { message_id: messageId });
    }

    const checkpoint = result.suspension?.kind === "work"
      ? { phase: "worker_wait", active_run_id: result.suspension.runId }
      : result.suspension?.kind === "input" && execution.workerInput
        ? {
            phase: "worker_input_wait",
            worker_event: claimed.checkpoint?.phase === "worker_result"
              ? claimed.checkpoint.worker_event
              : { type: "worker_input", payload: {} },
            input_request: execution.workerInput,
          }
      : result.suspension?.kind === "input"
        ? { phase: "user_wait" }
        : { phase: "done" };
    const status: NumoTurnStatus = result.suspension?.kind === "work"
      ? "waiting_work"
      : result.suspension?.kind === "input"
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
      activeRunId: result.suspension?.kind === "work"
        ? result.suspension.runId
        : result.suspension?.kind === "input" && execution.workerInput
          ? execution.workerInput.runId
          : null,
      outcome: result.fullContent || null,
      userId: claimed.user_id,
      costUsd: recordedOperationCost ?? fallbackCostUsd,
    });
    if (
      claimed.active_run_id &&
      (status === "completed" || status === "waiting_input")
    ) {
      const worker = await getRun(claimed.active_run_id, { decode: false });
      if (worker?.parent_numo_turn_id === claimed.id) {
        const notificationType = status === "waiting_input"
          ? "agent_question"
          : worker.status === "failed" || worker.status === "canceled"
            ? "agent_failed"
            : "agent_done";
        await notifyDelegatedAgentRun(worker, notificationType);
      }
    }
    if (status === "waiting_work" && result.suspension?.kind === "work") {
      const worker = await getRun(result.suspension.runId, { decode: false });
      if (worker && ["completed", "failed", "canceled"].includes(worker.status)) {
        await deliverAgentDelegationResult(worker);
        const { data: reconciled } = await service.from("numo_assistant_turns")
          .select("*").eq("id", claimed.id).single();
        if (reconciled) {
          const latest = await hydrateNumoTurn(reconciled as NumoTurn);
          emitter.emit("done", { status: latest.status });
          await emitter.flush();
          emitter.close();
          return { status: latest.status, turn: latest };
        }
      }
    }
    emitter.emit("done", { status });
    await emitter.flush();
    emitter.close();
    return { status: turn.status, turn };
  } catch (error) {
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
        activeRunId: claimed.active_run_id,
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
        await interruptTurnWorkers(service, current.id);
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
    const storedFailureCheckpoint = (currentClaim as
      { checkpoint?: NumoTurnCheckpoint } | null)?.checkpoint;
    const failureCheckpoint = storedFailureCheckpoint
      ? await decodeNumoCheckpoint(claimed.user_id, claimed.id,
          storedFailureCheckpoint as unknown as Record<string, unknown>) as
          unknown as NumoTurnCheckpoint
      : latestCheckpoint;
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
      turn = await hydrateNumoTurn(data as NumoTurn);
      if (turn.status === "stopping" && turn.claim_token === claimToken) {
        await interruptTurnWorkers(service, turn.id);
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
      notifyAutomationOfNumoTurn(result.turn);
      notifyRoutineOfNumoTurn(result.turn);
    }
    return result;
  } catch (error) {
    await failNumoSurfaceProjection(service, input.turnId);
    throw error;
  }
}

export async function resumeNumoTurnFromWorker(input: {
  runId: string;
  projectId: string;
  eventId: string;
  type: "worker_completed" | "worker_failed" | "worker_input";
  payload: Record<string, unknown>;
}): Promise<"queued" | "duplicate" | "ignored"> {
  const service = getServiceClient();
  const payload = await encodeWorkerEventPayload(service, input);
  const { data, error } = await service.rpc("resume_numo_turn_from_worker", {
    p_run_id: input.runId,
    p_event_id: input.eventId,
    p_type: input.type,
    p_payload: payload,
  });
  if (error) throw new Error(error.message);
  return data as "queued" | "duplicate" | "ignored";
}

export async function requestNumoTurnStop(conversationId: string, userId: string) {
  const service = getServiceClient();
  const { data, error } = await service.from("numo_assistant_turns")
    .select("request_id").eq("conversation_id", conversationId).eq("user_id", userId)
    .in("status", ["queued", "running", "stopping", "waiting_work", "waiting_input", "retryable", "reconciling"])
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
      .in("status", ["queued", "running", "stopping", "waiting_work", "waiting_input", "retryable", "reconciling"])
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
  // Retire authority first: a concurrent worker admission checks its parent's
  // live status and cannot launch after this boundary. Repeat the cascade on
  // retries so a failed network write never becomes an acknowledged stop.
  const [workerRead, workerInterrupt] = await Promise.all([
    service.from("agent_runs").select("id").eq("parent_numo_turn_id", turn.id),
    service.from("agent_runs").update({ interrupt_requested: true }).eq("parent_numo_turn_id", turn.id)
      .in("status", ["queued", "running"]),
    cancelStoppedTurnWorkerInputs(turn.id),
  ]);
  const { data: workers, error: workersError } = workerRead;
  if (workersError) throw new Error("Unable to read Numo stop scope");
  if (workerInterrupt.error) throw new Error("Unable to stop Numo workers");
  const workerIds = (workers ?? []).map(worker => worker.id as string);
  await Promise.all(workerIds.map(discardPendingWorkerMessages));
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

/** Finish a Stop that raced with a submission being routed into an existing worker. */
export async function stopCanceledNumoMediation(input: {
  conversationId: string;
  requestId: string;
  userId: string;
  parentTurnId: string;
}): Promise<{ id: string; status: NumoTurnStatus } | null> {
  const service = getServiceClient();
  const { data: receipt, error } = await service.from("numo_assistant_turns")
    .select("id").eq("conversation_id", input.conversationId).eq("user_id", input.userId)
    .eq("request_id", input.requestId).eq("status", "stopped").maybeSingle();
  if (error) throw new Error("Unable to read mediated Numo submission authority");
  if (!receipt) return null;
  const { data: parent, error: parentError } = await service.from("numo_assistant_turns")
    .select("request_id").eq("id", input.parentTurnId).eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId).single();
  if (parentError || !parent) throw new Error("Unable to authorize canceled Numo mediation");
  return requestNumoRequestStop({ ...input, requestId: parent.request_id as string });
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
  const { data: waitingWorkers, error: waitingWorkersError } = await service
    .from("numo_assistant_turns")
    .select("active_run_id")
    .eq("status", "waiting_work")
    .not("active_run_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(options?.limit ?? 10);
  if (waitingWorkersError) throw new Error(waitingWorkersError.message);
  for (const waiting of waitingWorkers ?? []) {
    const worker = await getRun(waiting.active_run_id as string);
    if (worker && ["completed", "failed", "canceled"].includes(worker.status)) {
      await deliverAgentDelegationResult(worker);
    }
  }
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
    // purpose: without it, `executeNumoTurnCore` treats any non-worker-result
    // resume as an interrupted request and flips the turn straight back to
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
