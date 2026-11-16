import "server-only";
import { ADMIN_READ_TOOLS } from "./admin-tools";
import { withConversationAttachmentPreviews } from "./conversation-attachments";
import { visibleAssistantContent } from "./visible-content";
import { hasSerializedToolCall, looksLikePendingAction } from "@/lib/ai-completion";
import { randomUUID } from "node:crypto";
import { encodeNumoToolMessage,
  shouldProtectNumoToolContent } from "@/lib/server/numo/tool-content";

import type { AssistantToolCall } from "@/lib/assistant-types";
import { parseAskUserQuestions } from "@/lib/ask-user";
import type { SafeEmitter } from "./sse";
import {
  executeTool,
  type ToolContext,
  type ToolExecution,
} from "./execute-tool";
import type { AssistantToolDef } from "./tools";
import { numoToolPolicy } from "./tool-policy";
import { matchDeferredTools, SEARCH_TOOLS_NAME } from "./tool-loading";
import { toolRulesFor } from "./prompt";
import { redactDeep, SecretRedactor } from "@/lib/server/agent/redact";
import { fetchAiChat, type ResolvedAiRuntime } from "@/lib/server/ai-runtime";
import { managedAiKeyMode } from "@/lib/managed-services";
import {
  getCachedOpenRouterModelInfo,
  getOpenRouterModelInfo,
  loadOpenRouterIndex,
} from "@/lib/server/agent/openrouter-index";
import {
  getToolResultCharLimit,
  serializeToolResult,
} from "./tool-result-serialization";
import {
  DEFAULT_REASONING_LEVEL,
  reasoningMaxTokens,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import type { AssistantReasoning } from "@/lib/assistant-reasoning";
import { AssistantReasoningStream } from "./reasoning-stream";
import {
  COMPACTION_TOOL_NAME,
  compactionModel,
  estimatePromptTokens,
  numoCompactThreshold,
  numoContextWindow,
  planCompaction,
  summarizeForCompaction,
  truncateToolResults,
  withContextSummary,
} from "./context-compaction";
import {
  ProviderRequestError,
  providerErrorFromResponse,
  reportProviderError,
} from "@/lib/server/ai-provider-errors";

// ── OpenRouter streaming agent loop (ported from AutoKap's assistant) ───


/** One entry of a multimodal message content array (OpenRouter chat format). */
export type ChatContentPart =
  | { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | ChatContentPart[] | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface GenerationInfo {
  generationId: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  /** USD cost reported by OpenRouter (null if not provided). */
  cost: number | null;
  /**
   * Prompt tokens read from and written to the provider's cache (MIN-1001),
   * `null` when the provider says nothing: the ledger's hit rate.
   */
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
}

export interface ProcessChatResult {
  fullContent: string;
  finalReasoning: AssistantReasoning | null;
  allToolCalls: AssistantToolCall[];
  generations: GenerationInfo[];
  suspension: ProcessChatSuspension | null;
}

export type ProcessChatSuspension =
  | { kind: "input" }
  /**
   * The job ran out of time before the next step (MIN-1010). The durable
   * checkpoint already describes that step: a new job resumes from it.
   */
  | { kind: "handoff" };

export interface ProcessChatCheckpoint {
  phase: "model" | "tools";
  assistantContent?: string | null;
  assistantReasoning?: AssistantReasoning | null;
  assistantMessageId?: string | null;
  pendingToolCalls?: AssistantToolCall[];
  completedToolCallIds?: string[];
  roundCount?: number;
  /** Keep correction attempts bounded across durable resumes. */
  completionRepairs?: number;
  completionRepairPending?: boolean;
  completionRepairExhausted?: boolean;
  /**
   * What the last rejected reply got wrong. A resumed or retried turn that
   * finds the bound exhausted reports it, rather than a generic message.
   */
  completionProblem?: string;
  /** Empty replies need a visible-answer repair, including after a durable resume. */
  emptyAnswerRepair?: boolean;
}

export class NumoCompletionError extends Error {
  constructor(readonly reason: string) {
    super(`The model did not complete the requested work: ${reason}. No completion was recorded.`);
    this.name = "NumoCompletionError";
  }
}

const MAX_COMPLETION_REPAIRS = 2;
const SUCCESSFUL_FINISH_REASONS = new Set(["stop", "tool_calls", "function_call", "end_turn", "stop_sequence"]);
const COMPLETION_REPAIR_PROMPT =
  "Your previous response did not complete the requested work. " +
  "If work remains, use the advertised native tool calls now; never serialize tool calls as XML or prose. " +
  "Complete the task and return the actual outcome, or state the concrete blocker. " +
  "Do not finish with an announcement of an action you have not performed.";
const EMPTY_ANSWER_REPAIR_PROMPT =
  "Your previous response contained no visible answer. Reasoning alone is not a reply. " +
  "Return a non-empty final answer in the assistant content, using the available results. " +
  "Report the actual outcome, including any failure, partial work or concrete blocker. ";

function completionRepairPrompt(emptyAnswerRepair: boolean, canUseTools: boolean): string {
  if (!emptyAnswerRepair) return COMPLETION_REPAIR_PROMPT;
  return EMPTY_ANSWER_REPAIR_PROMPT + (canUseTools
    ? "If an action remains, use the advertised native tools before answering; do not repeat completed actions."
    : "No tools are available in this reply. Summarize the recorded outcome instead of announcing another action.");
}

function malformedNativeCalls(calls: Iterable<{ id: string; name: string; arguments: string }>): boolean {
  const ids = new Set<string>();
  for (const call of calls) {
    if (typeof call.id !== "string" || !call.id.trim()
      || typeof call.name !== "string" || !call.name.trim()
      || typeof call.arguments !== "string" || ids.has(call.id)) return true;
    ids.add(call.id);
    try {
      const args: unknown = JSON.parse(call.arguments);
      if (!args || typeof args !== "object" || Array.isArray(args)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

export interface ToolLedgerClaim {
  action: "execute" | "reuse" | "reconcile" | "lost_claim";
  execution?: ToolExecution;
}

/** Durable exactly-once boundary supplied by the Numo turn service. */
export interface ToolExecutionLedger {
  claim(input: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    replayPolicy: "retry" | "reconcile";
  }): Promise<ToolLedgerClaim>;
  complete(input: {
    toolCallId: string;
    success: boolean;
    result: unknown;
    modelResult: unknown;
    pause: boolean;
  }): Promise<void>;
}

export class AmbiguousToolExecutionError extends Error {
  constructor(readonly toolName: string, readonly toolCallId: string) {
    super(`Tool ${toolName} may have completed before its result was recorded`);
    this.name = "AmbiguousToolExecutionError";
  }
}

/**
 * Silence tolerated from the provider stream before the round is abandoned.
 * OpenRouter sends `: OPENROUTER PROCESSING` keep-alive comments while the
 * model thinks, so a live stream keeps re-arming this timer even across long
 * reasoning phases. A stream that stops sending anything is a hang: without
 * this ceiling the round would hold the turn `running` until the stale-lease
 * recovery steals it six minutes later, and a stop request could not be
 * observed before the stream ended.
 */
const STREAM_IDLE_TIMEOUT_MS = 90_000;
/**
 * Ceiling between two `shouldStop` polls throughout model and tool execution.
 */
const STOP_POLL_INTERVAL_MS = 250;

/**
 * Raised when the provider stream carried nothing for the idle ceiling. The
 * durable turn records it as retryable and the drain resumes the turn from
 * its last checkpoint.
 */
export class LlmStreamIdleError extends Error {
  constructor() {
    super(
      `The model stream stayed idle for ${STREAM_IDLE_TIMEOUT_MS / 1000} seconds and was aborted`,
    );
    this.name = "LlmStreamIdleError";
  }
}

/**
 * Prompt-cache hints are optional: use available metadata and refresh it in
 * the background so a cold or slow catalog cannot delay the first token.
 */
export async function modelSupportsCaching(
  model: string,
  apiKey: string,
): Promise<boolean> {
  void loadOpenRouterIndex(apiKey);
  return getCachedOpenRouterModelInfo(model)?.promptCaching ?? false;
}

/**
 * A second cache breakpoint, on the latest user message (MIN-1001), when the
 * system prompt carries the first one. Every round of a turn resends the whole
 * history; with the breakpoint, the rounds after the first read everything up
 * to the user's message from cache instead of paying it again. Anthropic and
 * Gemini models on OpenRouter take at most four breakpoints: this makes two.
 */
export function withHistoryCacheBreakpoint(messages: ChatMessage[]): ChatMessage[] {
  const system = messages[0];
  if (system?.role !== "system" || !Array.isArray(system.content)
    || !system.content.some((part) => part.type === "text" && part.cache_control)) {
    return messages;
  }
  let index = messages.length - 1;
  while (index > 0 && messages[index].role !== "user") index -= 1;
  if (index <= 0) return messages;
  const message = messages[index];
  const parts: ChatContentPart[] = typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : Array.isArray(message.content) ? [...message.content] : [];
  let textIndex = parts.length - 1;
  while (textIndex >= 0 && parts[textIndex].type !== "text") textIndex -= 1;
  const part = parts[textIndex];
  if (!part || part.type !== "text" || !part.text) return messages;
  parts[textIndex] = { ...part, cache_control: { type: "ephemeral" } };
  const next = [...messages];
  next[index] = { ...message, content: parts };
  return next;
}

/**
 * Attachment capabilities must be resolved before constructing provider input.
 * This shares the catalog used by model validation and prompt-cache hints.
 */
export async function getModelInputModalities(
  model: string,
  apiKey: string,
): Promise<Set<string>> {
  const info = await getOpenRouterModelInfo(model, apiKey);
  return new Set(info?.inputModalities ?? ["text"]);
}

/**
 * Input modalities for a runtime's provider: OpenRouter publishes them per
 * model; the native Anthropic transport carries images and PDFs, which every
 * current Claude model reads; the other endpoints receive text only.
 */
export async function providerInputModalities(
  runtime: Pick<ResolvedAiRuntime, "provider" | "apiKey">,
  model: string,
): Promise<Set<string>> {
  if (runtime.provider === "openrouter") return getModelInputModalities(model, runtime.apiKey);
  return new Set(runtime.provider === "anthropic" ? ["text", "image", "file"] : ["text"]);
}

export interface ProcessChatContext extends ToolContext {
  model: string;
  conversationId: string;
  reasoningLevel?: ReasoningLevel;
  /** Solved by the way. Optional for internal calls/historical tests. */
  aiRuntime?: ResolvedAiRuntime;
  /** Durable assistant turn. Absent for legacy entry points such as comments. */
  turnId?: string;
  resumeCheckpoint?: ProcessChatCheckpoint | null;
  persistCheckpoint?: (checkpoint: ProcessChatCheckpoint) => Promise<void>;
  persistToolRound?: (input: {
    assistantContent: string | null;
    assistantReasoning: AssistantReasoning | null;
    pendingToolCalls: AssistantToolCall[];
    roundCount: number;
    completionRepairs?: number;
  }) => Promise<string>;
  toolLedger?: ToolExecutionLedger;
  shouldStop?: () => Promise<boolean>;
  /**
   * Registers a synchronous stop listener, called the instant a stop request
   * lands in this process. It stays armed across generation and tool rounds,
   * including pending provider reads and cancellable database reads.
   */
  onStopSignal?: (notify: () => void) => () => void;
  /**
   * Asked at the two durable boundaries, before a generation and before a
   * tool that has not run yet: true when the job's time left does not cover
   * that step (MIN-1010). The loop then stops with a `handoff` suspension.
   * It is never asked before the job has run one step of its own.
   */
  shouldHandOff?: (step: "generation" | "tool") => boolean;
  /** Budget gate immediately before every provider generation. */
  beforeGeneration?: (roundCount: number) => Promise<void>;
  /** Persist one generation before any tool it requested can launch work. */
  onGeneration?: (
    generation: GenerationInfo,
    roundCount: number,
  ) => Promise<void>;
  /**
   * The turn's pool tools not sent yet (MIN-1001), loaded by search_tools or
   * by a direct call. Present, a call to a tool outside the turn's pool is
   * refused; absent (internal callers), the tool list is fixed.
   */
  deferredTools?: AssistantToolDef[];
  /**
   * Context compaction (MIN-954). Absent, the history is sent as it is.
   * `summary` is the stored summary of the conversation's start, if any.
   */
  compaction?: NumoCompactionContext;
}

/** A stored history message: its id and creation time, the summary's boundary. */
export interface StoredMessageOrigin {
  id: string;
  createdAt: string;
}

export interface NumoCompactionContext {
  summary: string | null;
  /** The stored row a history message came from; none for this turn's own messages. */
  originOf: (message: ChatMessage) => StoredMessageOrigin | undefined;
  /** Stores the new summary and the last stored message it covers. */
  persist: (input: { summary: string; through: StoredMessageOrigin | null }) => Promise<void>;
  /** Records the summary call in `ai_usage`, like the turn's own generations. */
  recordUsage: (generation: GenerationInfo, roundCount: number) => Promise<void>;
}

export function toolReplayPolicy(toolName: string): "retry" | "reconcile" {
  return numoToolPolicy(toolName)?.replay === "retry" || ADMIN_READ_TOOLS.has(toolName) ? "retry" : "reconcile";
}

async function saveToolResultMessage(
  context: ProcessChatContext,
  row: Record<string, unknown>,
): Promise<void> {
  const protectedRow = await shouldProtectNumoToolContent(context.service)
    ? await encodeNumoToolMessage(context.userId, randomUUID(), {
        role: "tool", content: row.content as string | null,
        tool_calls: null, context: null, metadata: row.metadata ?? {},
      }) : null;
  const { error } = await context.service.from("assistant_messages")
    .insert({ ...row, ...protectedRow });
  if (!error) return;
  // A completed ledger entry can be replayed after the message insert committed
  // but before its checkpoint did. The per-turn partial unique index proves that
  // this conflict is the same tool result, so it is safe to reuse.
  if (context.turnId && error.code === "23505") return;
  throw new Error(error.message);
}

/**
 * Stores the compaction step as a tool call and its result, so the
 * conversation shows it after a reload like any other step. Both rows are
 * marked `context_compaction`: the next turns leave them out of the model's
 * history. Returns the id of the call's message.
 */
async function saveCompactionStep(
  context: ProcessChatContext,
  callId: string,
  success: boolean,
): Promise<string> {
  const call: AssistantToolCall = {
    id: callId, type: "function", function: { name: COMPACTION_TOOL_NAME, arguments: "{}" },
  };
  const result = JSON.stringify({ status: success ? "compacted" : "failed" });
  const callMetadata = { context_compaction: true };
  const resultMetadata = { success, context_compaction: true };
  const callMessageId = randomUUID();
  const resultId = randomUUID();
  const protect = await shouldProtectNumoToolContent(context.service);
  const [protectedCall, protectedResult] = protect
    ? await Promise.all([
        encodeNumoToolMessage(context.userId, callMessageId, {
          role: "assistant", content: null, tool_calls: [call], context: null, metadata: callMetadata,
        }),
        encodeNumoToolMessage(context.userId, resultId, {
          role: "tool", content: result, tool_calls: null, context: null, metadata: resultMetadata,
        }),
      ])
    : [null, null];
  // Explicit times keep the call before its result in the thread's order.
  const at = Date.now();
  const turn = context.turnId ? { turn_id: context.turnId } : {};
  const { error } = await context.service.from("assistant_messages").insert([
    {
      id: callMessageId, conversation_id: context.conversationId, ...turn, role: "assistant",
      content: null, tool_calls: [call], metadata: callMetadata,
      created_at: new Date(at).toISOString(), ...protectedCall,
    },
    {
      id: resultId, conversation_id: context.conversationId, ...turn, role: "tool",
      content: result, tool_call_id: callId, tool_name: COMPACTION_TOOL_NAME, metadata: resultMetadata,
      created_at: new Date(at + 1).toISOString(), ...protectedResult,
    },
  ]);
  if (error) throw new Error(error.message);
  return callMessageId;
}

/**
 * The agentic while-loop: stream one OpenRouter completion, forward deltas to
 * the client as SSE, execute any tool calls, persist every intermediate
 * message, feed results back, and repeat within a bounded tool budget. A final
 * text-only round always closes the turn. `ask_user` pauses the loop — the
 * user's answer arrives as the next POST.
 */
export async function processChat(
  messages: ChatMessage[],
  initialTools: AssistantToolDef[],
  emitter: SafeEmitter,
  context: ProcessChatContext
): Promise<ProcessChatResult> {
  // The list grows when the turn loads deferred tools (MIN-1001); a loaded
  // tool joins the end, so the cached prefix of the next round holds.
  const tools = [...initialTools];
  const deferredPool = [...(context.deferredTools ?? [])];
  const loadingTools = context.deferredTools !== undefined;
  /**
   * A call the loop answers itself: search_tools, or a refusal for a tool
   * outside the turn's pool. `null` runs the tool, after loading it when the
   * model called a deferred tool by name.
   */
  const localToolExecution = (name: string, args: Record<string, unknown>): ToolExecution | null => {
    if (!loadingTools) return null;
    if (name === SEARCH_TOOLS_NAME) {
      const query = typeof args.query === "string" ? args.query : "";
      const matched = matchDeferredTools(query, deferredPool);
      // Already loaded: say so rather than fail, the model may have missed it.
      const available = matched.length === 0 ? matchDeferredTools(query, tools) : [];
      if (available.length > 0) {
        return {
          success: true,
          result: { loaded: [], already_available: available.map((tool) => tool.function.name) },
        };
      }
      if (matched.length === 0) {
        return {
          success: false,
          result: {
            error: `No tool to load matches "${query}". Pass names listed under "More tools".`,
            available: deferredPool.map((tool) => tool.function.name),
          },
        };
      }
      for (const tool of matched) {
        deferredPool.splice(deferredPool.indexOf(tool), 1);
        tools.push(tool);
      }
      const loaded = matched.map((tool) => tool.function.name);
      const rules = toolRulesFor(new Set(loaded));
      return {
        success: true,
        result: { loaded, ...(rules ? { rules } : {}), next: "Call them from your next step." },
      };
    }
    if (tools.some((tool) => tool.function.name === name)) return null;
    const index = deferredPool.findIndex((tool) => tool.function.name === name);
    if (index >= 0) {
      tools.push(...deferredPool.splice(index, 1));
      return null;
    }
    return { success: false, result: { error: `${name} is not available in this turn. Do not retry.` } };
  };
  // Numo turns always pass their resolved runtime. The shared-key default only
  // serves a shared-key deployment: on Minddy Cloud, every billed call pays
  // with its account's own key (MIN-761).
  if (!context.aiRuntime && managedAiKeyMode() === "per_user") {
    throw new Error("A Numo turn needs its resolved AI runtime on Minddy Cloud");
  }
  const aiRuntime: ResolvedAiRuntime = context.aiRuntime ?? {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    mode: "platform",
    provider: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: context.model,
    requestProfile: {
      usageAccounting: true,
      streamUsage: true,
      outputTokenField: "max_completion_tokens",
      defaultMaxOutputTokens: 8192,
      attribution: true,
      promptCaching: true,
    },
  };
  if (!aiRuntime.apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const generations: GenerationInfo[] = [];
  let finalContent = "";
  let finalReasoning: AssistantReasoning | null = null;
  const allToolCalls: AssistantToolCall[] = [];
  let continueLoop = true;
  let roundCount = context.resumeCheckpoint?.roundCount ?? 0;
  // The template sent, including routing suffix (MIN-263) — it may lose its
  // suffix being looped if OpenRouter refuses it.
  let requestModel = context.model;
  // A turn has no tool round limit (MIN-1008): it ends when the model answers,
  // the user stops it, or a spend budget runs out (the routine cap per turn,
  // the account's included usage). `roundCount` still numbers the rounds for
  // the usage ledger and the checkpoints.
  const reasoningLevel = context.reasoningLevel ?? DEFAULT_REASONING_LEVEL;
  // Living IDs seen during the tour (MIN-343). The register is
  // CUMULATIVE on purpose: a key returned in round 1 must remain substituted in
  // what a round 3 `list_integrations` would rewrite.
  const redactor = new SecretRedactor();
  let suspension: ProcessChatSuspension | null = null;
  // Generations and tools this job ran. A job always takes one step before it
  // may hand off, so a job started late cannot hand off forever.
  let stepsRun = 0;
  let handingOff = false;
  const handOffBefore = (step: "generation" | "tool") => {
    if (stepsRun === 0 || !context.shouldHandOff?.(step)) return false;
    handingOff = true;
    return true;
  };
  let resumeCheckpoint = context.resumeCheckpoint ?? null;
  let completionRepairs = Math.min(MAX_COMPLETION_REPAIRS,
    Math.max(0, Math.floor(resumeCheckpoint?.completionRepairs ?? 0)));
  let emptyAnswerRepair = resumeCheckpoint?.emptyAnswerRepair === true;
  if (resumeCheckpoint?.phase === "model" && resumeCheckpoint.completionRepairPending) {
    messages.push({ role: "user", content: completionRepairPrompt(emptyAnswerRepair,
      tools.length > 0) });
  }
  // True as soon as a stop was observed anywhere in the round (mid-stream or
  // between tools): the loop stops handing the turn back with no persisted
  // work beyond the durable checkpoints already written.
  let stopObserved = false;
  const executionStop = new AbortController();
  let activeGeneration: AbortController | null = null;
  let stopPollTimer: ReturnType<typeof setTimeout> | null = null;
  let executionClosed = false;
  const observeStop = () => {
    stopObserved = true;
    executionStop.abort();
    activeGeneration?.abort();
  };
  const pollStop = async () => {
    try {
      if (await context.shouldStop?.()) observeStop();
    } catch {
      // Retry transient authority reads while the execution remains live.
    } finally {
      if (!executionClosed && !stopObserved) {
        stopPollTimer = setTimeout(() => { void pollStop(); }, STOP_POLL_INTERVAL_MS);
      }
    }
  };
  const stopSignalOff = context.onStopSignal?.(observeStop) ?? null;
  stopPollTimer = setTimeout(() => { void pollStop(); }, STOP_POLL_INTERVAL_MS);

  // Context compaction (MIN-954): the stored summary joins the system prompt,
  // and before each generation an oversized prompt is compacted once.
  const compaction = context.compaction ?? null;
  const baseSystem = compaction && messages[0]?.role === "system" ? messages[0] : null;
  let contextSummary = compaction?.summary ?? null;
  if (baseSystem && contextSummary) messages[0] = withContextSummary(baseSystem, contextSummary);
  let compactThreshold: number | null = null;
  const compactIfNeeded = async (): Promise<void> => {
    if (!compaction || !baseSystem) return;
    compactThreshold ??= numoCompactThreshold(await numoContextWindow(aiRuntime, requestModel));
    if (estimatePromptTokens(messages, tools) <= compactThreshold) return;
    const plan = planCompaction(messages, compactThreshold);
    if (!plan) return;
    const callId = `compact_${randomUUID()}`;
    emitter.emit("tool_call_start", { id: callId, name: COMPACTION_TOOL_NAME });
    const summaryModel = await compactionModel(aiRuntime, requestModel);
    const outcome = await summarizeForCompaction({
      runtime: aiRuntime,
      model: summaryModel,
      previousSummary: contextSummary,
      summarized: plan.summarized,
      signal: executionStop.signal,
    });
    if (outcome) {
      await compaction.recordUsage(outcome.generation, roundCount).catch(() => {
        console.error("[numo-compaction] usage_record_failed");
      });
    }
    if (stopObserved) return;
    emitter.emit("tool_call_complete", { id: callId, name: COMPACTION_TOOL_NAME, arguments: "{}" });
    const summary = outcome?.summary ?? null;
    if (summary) {
      contextSummary = summary;
      const tailResultChars = Math.floor(compactThreshold * 4 * 0.2);
      messages.splice(0, messages.length,
        withContextSummary(baseSystem, summary),
        ...(plan.lastUser ? [plan.lastUser] : []),
        ...truncateToolResults(plan.tail, tailResultChars));
      // The summary covers every stored message up to the last one it read.
      let through: StoredMessageOrigin | null = null;
      for (const message of plan.summarized) through = compaction.originOf(message) ?? through;
      // Best effort: the turn goes on with the compacted history either way,
      // and a later turn compacts again from the messages.
      await compaction.persist({ summary, through }).catch(() => {
        console.error("[numo-compaction] summary_persist_failed");
      });
    }
    const messageId = await saveCompactionStep(context, callId, !!summary).catch(() => {
      console.error("[numo-compaction] step_persist_failed");
      return null;
    });
    if (messageId) emitter.emit("message_complete", { message_id: messageId });
    const compactionResult = {
      id: callId,
      name: COMPACTION_TOOL_NAME,
      result: { status: summary ? "compacted" : "failed" },
      success: !!summary,
    };
    emitter.emit("tool_result", compactionResult);
    emitter.journal?.("tool_result", compactionResult);
  };

  try {
  while (continueLoop) {
    continueLoop = false;
    if (await context.shouldStop?.()) observeStop();
    if (stopObserved) break;
    if (resumeCheckpoint?.completionRepairExhausted) {
      throw new NumoCompletionError(resumeCheckpoint.completionProblem
        ?? "the bounded correction attempts were exhausted");
    }
    const resumingTools = resumeCheckpoint?.phase === "tools";
    // The checkpoint written before this point is `model` (or the turn's
    // first): the next job opens this same round.
    if (!resumingTools && handOffBefore("generation")) break;
    roundCount = resumingTools
      ? Math.max(roundCount, resumeCheckpoint?.roundCount ?? 1)
      : roundCount + 1;
    // At most one compaction per model call, before the call opens.
    if (!resumingTools) {
      await compactIfNeeded();
      if (stopObserved) break;
    }

    let fullContent = resumingTools
      ? resumeCheckpoint?.assistantContent ?? ""
      : "";
    let rawContent = fullContent;
    let generationId: string | null = null;
    let usageInfo: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cost?: number;
      prompt_tokens_details?: { cached_tokens?: number | null; cache_write_tokens?: number | null } | null;
    } | null = null;
    let modelUsed: string | null = null;
    let terminalFinish: string | null = null;
    let receivedDone = false;
    let malformedToolDelta = false;
    const toolCallAccumulators: Map<
      number,
      { id: string; name: string; arguments: string; extraContent?: unknown }
    > = new Map();
    // Claude's signed thinking blocks and OpenAI's encrypted reasoning items of
    // this round (their native transports only), replayed with its tool calls
    // on the next round of the same turn.
    const roundReasoningDetails: unknown[] = [];
    let roundReasoning: AssistantReasoning | null = resumingTools
      ? resumeCheckpoint?.assistantReasoning ?? null
      : null;

    if (resumingTools) {
      for (const [index, call] of (resumeCheckpoint?.pendingToolCalls ?? []).entries()) {
        toolCallAccumulators.set(index, {
          id: call?.id,
          name: call?.function?.name,
          arguments: call?.function?.arguments,
          ...(call?.extra_content !== undefined ? { extraContent: call.extra_content } : {}),
        });
      }
      if (!toolCallAccumulators.size || malformedNativeCalls(toolCallAccumulators.values())) {
        throw new NumoCompletionError("the resumed native tool checkpoint was malformed");
      }
    } else {
      // One controller per generation round: it carries both the idle watchdog
      // and a mid-stream stop. Aborting the signal destroys the pinned socket,
      // which is what makes a hung stream, or a stop request, observable here.
      const generationController = new AbortController();
      activeGeneration = generationController;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let idleAborted = false;
      const closeRound = () => {
        if (idleTimer) clearTimeout(idleTimer);
        if (activeGeneration === generationController) activeGeneration = null;
      };
      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleAborted = true;
          generationController.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      armIdleTimer();
      let call;
      try {
        // Budget and preparation reads can be slow too. A hosted executor
        // must observe Stop before opening a provider request, not only once
        // response headers or text arrive.
        let rejectPreparation!: () => void;
        const interrupted = new Promise<never>((_resolve, reject) => {
          rejectPreparation = () => reject(new Error("Generation preparation interrupted"));
          generationController.signal.addEventListener("abort", rejectPreparation, { once: true });
        });
        try {
          if (generationController.signal.aborted) rejectPreparation();
          await Promise.race([context.beforeGeneration?.(roundCount), interrupted]);
        } finally {
          generationController.signal.removeEventListener("abort", rejectPreparation);
        }
        if (stopObserved || await context.shouldStop?.()) {
          observeStop();
          closeRound();
          break;
        }
        const previewMessages = await withConversationAttachmentPreviews(messages, context, () =>
          providerInputModalities(aiRuntime, requestModel));
        // The native Anthropic transport caches automatically up to the last
        // block; OpenRouter needs the breakpoint written in the message.
        const modelMessages = aiRuntime.provider === "openrouter"
          ? withHistoryCacheBreakpoint(previewMessages)
          : previewMessages;
        // Some providers end normally after reasoning without any visible text.
        // Change that request during repair only when the catalog explicitly
        // permits disabling reasoning; mandatory and unknown models keep theirs.
        const repairWithoutReasoning = emptyAnswerRepair && aiRuntime.provider === "openrouter"
          && (await getOpenRouterModelInfo(requestModel, aiRuntime.apiKey))?.reasoning?.mandatory === false;
        if (stopObserved || await context.shouldStop?.()) {
          observeStop();
          closeRound();
          break;
        }
        // This round's tools: search_tools may grow the list for the next one.
        const roundTools = [...tools];
        call = await fetchAiChat(
          aiRuntime,
          requestModel,
          (m) => ({
            model: m,
            messages: modelMessages,
            stream: true,
            maxOutputTokens: reasoningMaxTokens(4096, reasoningLevel),
            reasoning: repairWithoutReasoning ? { enabled: false } : { effort: reasoningLevel },
            ...(roundTools.length > 0 ? { tools: roundTools } : {}),
          }),
          "Numo (minddy)",
          "[assistant]",
          { signal: generationController.signal, sessionId: context.conversationId },
        );
      } catch (error) {
        closeRound();
        // The watchdog also covers the connection phase: a provider that
        // accepts the request and never answers must end as a retryable idle
        // failure, not as an opaque abort.
        if (stopObserved) {
          // The stop fired during the connection attempt: hand the turn back
          // unpersisted, like a stop observed mid-stream.
          break;
        }
        if (idleAborted || generationController.signal.aborted) throw new LlmStreamIdleError();
        throw error;
      }
      const response = call.response;
      requestModel = call.model;
      // These early exits precede the stream's watchdog cleanup. Keep the
      // turn's stop observer armed until the entire execution finishes.
      if (!response.ok) {
        // `fetchAiChat` already logged and reported it; the turn decides from
        // its status whether a retry can help.
        let providerError: ProviderRequestError;
        try {
          providerError = await providerErrorFromResponse(aiRuntime.provider, requestModel, response);
        } catch (error) {
          if (stopObserved) break;
          throw error;
        } finally {
          closeRound();
        }
        throw providerError;
      }
      const reader = response.body?.getReader();
      if (!reader) {
        closeRound();
        throw new Error("No response body from LLM");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const reasoningStream = new AssistantReasoningStream(emitter);
      // A stop requested while the loop sits on a pending `reader.read()`
      // (silent reasoning phases) aborts the provider request, which errors
      // the body stream and unblocks the pending read; the read rejection
      // sees `stopObserved` and the round is handed back unpersisted.
      try {
        while (true) {
          // A stop that arrives mid-stream aborts the provider request right
          // away: waiting for the round to end would leave a stop pending for
          // minutes on a long or hung stream.
          if (stopObserved) break;
          let chunk;
          try {
            chunk = await reader.read();
          } catch (readError) {
            if (stopObserved) break;
            if (idleAborted || generationController.signal.aborted) throw new LlmStreamIdleError();
            throw readError;
          }
          const { done, value } = chunk;
          if (stopObserved) break;
          if (!done) armIdleTimer();
          // A provider can close directly after its final data line. Flush the
          // decoder and that line instead of discarding its terminal/tool data.
          buffer += done ? `${decoder.decode()}\n` : decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              receivedDone = true;
              continue;
            }
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            if (parsed.id && !generationId) generationId = parsed.id;
            if (parsed.model) modelUsed = parsed.model;
            if (parsed.usage) usageInfo = parsed.usage;
            const choice = parsed.choices?.[0];
            const finish = choice?.finish_reason ?? choice?.native_finish_reason;
            if (typeof finish === "string" && finish) terminalFinish = finish;
            // OpenRouter reports mid-stream provider failures in-band: a
            // top-level `error` beside the choice, with `finish_reason:
            // "error"` and no usable content. Swallowing it would surface a
            // silently truncated reply, so it goes through the durable retry
            // path like any other generation failure.
            const streamError = parsed.error ?? choice?.error
              ?? (parsed.choices?.[0]?.finish_reason === "error"
                ? { message: "The provider disconnected mid-stream" }
                : null);
            if (streamError) {
              const providerError = new ProviderRequestError({
                provider: aiRuntime.provider,
                model: requestModel,
                status: null,
                providerErrorType: typeof streamError.type === "string" ? streamError.type
                  : typeof streamError.code === "string" ? streamError.code : null,
                providerMessage: String(streamError.message ?? "unknown provider error"),
              });
              reportProviderError(providerError, "assistant");
              throw providerError;
            }
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            // `reasoning` on OpenRouter and the Anthropic transport;
            // `reasoning_content` on DeepSeek-style upstreams (OpenCode, vLLM).
            const reasoningDelta = typeof delta.reasoning === "string" && delta.reasoning
              ? delta.reasoning
              : typeof delta.reasoning_content === "string" ? delta.reasoning_content : "";
            if (reasoningDelta) reasoningStream.push(reasoningDelta);
            if ((aiRuntime.provider === "anthropic" || aiRuntime.provider === "openai")
              && Array.isArray(delta.reasoning_details)) {
              roundReasoningDetails.push(...delta.reasoning_details);
            }
            if (delta.content) {
              roundReasoning = reasoningStream.finish();
              rawContent += delta.content;
              const visible = visibleAssistantContent(rawContent);
              const visibleDelta = visible.slice(fullContent.length);
              fullContent = visible;
              if (visibleDelta) emitter.emit("content_delta", { delta: visibleDelta });
            }
            if (delta.tool_calls != null && !Array.isArray(delta.tool_calls)) {
              malformedToolDelta = true;
            } else if (Array.isArray(delta.tool_calls)) {
              roundReasoning = reasoningStream.finish();
              for (const tc of delta.tool_calls) {
                if (!tc || typeof tc !== "object" || Array.isArray(tc)
                  || (tc.index != null && (!Number.isInteger(tc.index) || tc.index < 0))
                  || (tc.id != null && typeof tc.id !== "string")
                  || (tc.type != null && tc.type !== "function")
                  || (tc.function != null && (typeof tc.function !== "object" || Array.isArray(tc.function)))
                  || (tc.function?.name != null && typeof tc.function.name !== "string")
                  || (tc.function?.arguments != null && typeof tc.function.arguments !== "string")) {
                  malformedToolDelta = true;
                  continue;
                }
                const idx = tc.index ?? 0;
                if (!toolCallAccumulators.has(idx)) {
                  toolCallAccumulators.set(idx, {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    arguments: "",
                  });
                  if (tc.id && tc.function?.name) {
                    emitter.emit("tool_call_start", { id: tc.id, name: tc.function.name });
                  }
                }
                const acc = toolCallAccumulators.get(idx)!;
                if (tc.id) acc.id = tc.id;
                if (tc.extra_content !== undefined) acc.extraContent = tc.extra_content;
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) {
                  acc.arguments += tc.function.arguments;
                  emitter.emit("tool_call_args_delta", { id: acc.id, delta: tc.function.arguments });
                }
              }
            }
          }
          if (done) break;
        }
      } finally {
        closeRound();
        roundReasoning = reasoningStream.finish();
      }
      const generation = {
        generationId,
        model: modelUsed,
        promptTokens: usageInfo?.prompt_tokens ?? null,
        completionTokens: usageInfo?.completion_tokens ?? null,
        totalTokens: usageInfo?.total_tokens ?? null,
        cost: usageInfo?.cost ?? null,
        cachedTokens: usageInfo?.prompt_tokens_details?.cached_tokens ?? null,
        cacheWriteTokens: usageInfo?.prompt_tokens_details?.cache_write_tokens ?? null,
      };
      generations.push(generation);
      stepsRun++;
      await context.onGeneration?.(generation, roundCount);
      if (stopObserved) {
        // The stop was requested while this round streamed: hand the turn back
        // without persisting a partial round. `executeNumoTurnCore` observes
        // the pending stop and checkpoints
        // `stopped`.
        break;
      }

      const serializedCall = hasSerializedToolCall(rawContent);
      const pendingAction = toolCallAccumulators.size === 0 && looksLikePendingAction(fullContent);
      const truncated = terminalFinish === "length" || terminalFinish === "max_tokens";
      const invalidFinish = terminalFinish !== null && !SUCCESSFUL_FINISH_REASONS.has(terminalFinish);
      const incompleteTransport = !receivedDone && !terminalFinish;
      const emptyAnswer = toolCallAccumulators.size === 0 && !fullContent.trim();
      const missingNativeCalls = (terminalFinish === "tool_calls" || terminalFinish === "function_call")
        && toolCallAccumulators.size === 0;
      const invalidNativeCall = malformedToolDelta || malformedNativeCalls(toolCallAccumulators.values());
      const completionProblem = serializedCall ? "a tool call was returned as text"
        : truncated ? "the response reached its token limit"
        : invalidFinish ? "the provider did not report a successful finish"
        : incompleteTransport ? "the stream closed before a terminal response"
        : invalidNativeCall ? "the native tool call was malformed"
        : missingNativeCalls ? "the native tool call was missing"
        : pendingAction ? "the response only announced unfinished work"
        : emptyAnswer ? "the response was empty"
        : null;
      if (completionProblem) {
        if (await context.shouldStop?.()) observeStop();
        if (stopObserved) break;
        const exhausted = completionRepairs >= MAX_COMPLETION_REPAIRS;
        if (completionProblem === "the response was empty") emptyAnswerRepair = true;
        if (!exhausted) completionRepairs++;
        await context.persistCheckpoint?.({
          phase: "model", roundCount, completionRepairs,
          completionRepairPending: !exhausted,
          completionRepairExhausted: exhausted,
          ...(exhausted ? { completionProblem } : {}),
          ...(emptyAnswerRepair ? { emptyAnswerRepair: true } : {}),
        });
        if (exhausted) throw new NumoCompletionError(completionProblem);
        messages.push({ role: "user", content: completionRepairPrompt(emptyAnswerRepair,
          tools.length > 0) });
        continueLoop = true;
        continue;
      }
      emptyAnswerRepair = false;
    }

    // Process completed tool calls
    if (toolCallAccumulators.size > 0 && !stopObserved) {
      const assistantToolCalls: AssistantToolCall[] = [];
      for (const [, acc] of toolCallAccumulators) {
        emitter.emit("tool_call_complete", {
          id: acc.id,
          name: acc.name,
          arguments: acc.arguments,
        });
        assistantToolCalls.push({
          id: acc.id,
          type: "function",
          function: { name: acc.name, arguments: acc.arguments },
          ...(acc.extraContent !== undefined ? { extra_content: acc.extraContent } : {}),
        });
      }

      // Durable turns commit this message and their tool checkpoint atomically.
      // Legacy callers keep the historical direct insert path.
      let savedIntermediate: { id: string | null };
      if (resumingTools) {
        savedIntermediate = { id: resumeCheckpoint?.assistantMessageId ?? null };
      } else if (context.persistToolRound) {
        savedIntermediate = {
          id: await context.persistToolRound({
            assistantContent: fullContent || null,
            assistantReasoning: roundReasoning,
            pendingToolCalls: assistantToolCalls,
            roundCount,
            completionRepairs,
          }),
        };
      } else {
        const protectedRow = await shouldProtectNumoToolContent(context.service)
          ? await encodeNumoToolMessage(context.userId, randomUUID(), {
              role: "assistant",content: fullContent || null,
              tool_calls: assistantToolCalls,context: null,
              metadata: roundReasoning ? { reasoning: roundReasoning } : {},
            }) : null;
        const { data, error } = await context.service
          .from("assistant_messages")
          .insert({
            conversation_id: context.conversationId,
            ...(context.turnId ? { turn_id: context.turnId } : {}),
            role: "assistant",
            content: fullContent || null,
            tool_calls: assistantToolCalls,
            ...(roundReasoning ? { metadata: { reasoning: roundReasoning } } : {}),
            ...protectedRow,
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        savedIntermediate = { id: (data?.id as string | undefined) ?? null };
      }
      if (!savedIntermediate.id) throw new Error("Assistant tool round was not saved");

      if (savedIntermediate?.id) {
        emitter.emit("message_complete", {
          message_id: savedIntermediate.id,
        });
      }

      const completedToolCallIds = new Set(
        resumingTools ? resumeCheckpoint?.completedToolCallIds ?? [] : [],
      );
      if (resumingTools || !context.persistToolRound) {
        await context.persistCheckpoint?.({
          phase: "tools",
          assistantContent: fullContent || null,
          assistantReasoning: roundReasoning,
          assistantMessageId: savedIntermediate.id,
          pendingToolCalls: assistantToolCalls,
          completedToolCallIds: [...completedToolCallIds],
          roundCount,
          completionRepairs,
        });
      }
      resumeCheckpoint = null;

      // Add to chat history for LLM context
      messages.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: assistantToolCalls,
        ...(roundReasoningDetails.length > 0 ? { reasoning_details: roundReasoningDetails } : {}),
      });

      allToolCalls.push(...assistantToolCalls);

      // ask_user pauses immediately: the loop stops and waits for the user.
      // A routine or a background turn runs unattended: its ask_user goes to
      // executeTool, which refuses it, and the run carries on.
      const askUserPauses = !context.routineId && !context.proactive;
      const hasAskUser = askUserPauses && [...toolCallAccumulators.values()].some(
        (acc) => acc.name === "ask_user"
      );
      // A tool can hand over too (propose_backlog, MIN-173): what it puts
      // in front of the user waits for their gesture.
      let pausedByTool = false;

      // Execute each tool and save results to DB. A stop requested while a
      // slow tool runs also reaches the read transport. Mutating tools retain
      // their durable completion boundary before the stopped turn is returned.
      for (const [, acc] of toolCallAccumulators) {
        if (await context.shouldStop?.()) observeStop();
        if (stopObserved) break;
        const alreadyCompleted = completedToolCallIds.has(acc.id);
        if (acc.name === "ask_user" && askUserPauses) {
          // ask_user: emit a synthetic result and do NOT continue the loop
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(acc.arguments);
          } catch {
            // Invalid JSON from LLM
          }
          const questions = parseAskUserQuestions(parsed).map(
            (q) => q.question
          );

          const askResult = { status: "awaiting_user_response", questions };
          const askToolResult = { id: acc.id, name: "ask_user", result: askResult, success: true };
          emitter.emit("tool_result", askToolResult);
          emitter.journal?.("tool_result", askToolResult);

          if (!alreadyCompleted) {
            await saveToolResultMessage(context, {
              conversation_id: context.conversationId,
              ...(context.turnId ? { turn_id: context.turnId } : {}),
              role: "tool",
              content: JSON.stringify(askResult),
              tool_call_id: acc.id,
              tool_name: "ask_user",
              metadata: { success: true },
            });
          }

          messages.push({
            role: "tool",
            tool_call_id: acc.id,
            content: serializeToolResult(askResult),
          });
          completedToolCallIds.add(acc.id);
          suspension = { kind: "input" };
          await context.persistCheckpoint?.({
            phase: "tools",
            assistantContent: fullContent || null,
            assistantReasoning: roundReasoning,
            assistantMessageId: savedIntermediate.id,
            pendingToolCalls: assistantToolCalls,
            completedToolCallIds: [...completedToolCallIds],
            roundCount,
            completionRepairs,
          });
          continue;
        }

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(acc.arguments);
        } catch {
          // Invalid JSON from LLM
        }

        let execution: ToolExecution;
        const cancellableRead = numoToolPolicy(acc.name)?.cancellableRead === true;
        // Answered by the loop: pure, so it runs again on a resumed round
        // rather than going through the durable ledger.
        const local = localToolExecution(acc.name, args);
        // The `tools` checkpoint lists the calls done so far: the next job
        // runs this one and those after it.
        if (!local && !alreadyCompleted && handOffBefore("tool")) break;
        const ledgerClaim = local
          ? { action: "local" as const }
          : context.toolLedger
          ? await context.toolLedger.claim({
              toolCallId: acc.id,
              toolName: acc.name,
              args,
              replayPolicy: toolReplayPolicy(acc.name),
            })
          : { action: "execute" as const };
        if (ledgerClaim.action === "reconcile") {
          throw new AmbiguousToolExecutionError(acc.name, acc.id);
        }
        if (ledgerClaim.action === "execute") stepsRun++;
        if (ledgerClaim.action === "lost_claim") {
          throw new Error("Numo turn execution claim was lost");
        }
        if (local) {
          execution = local;
        } else if (ledgerClaim.action === "reuse" && ledgerClaim.execution) {
          execution = ledgerClaim.execution;
        } else {
          if (stopObserved || await context.shouldStop?.()) {
            observeStop();
            break;
          }
          const pendingExecution = executeTool(acc.name, args, {
            ...context,
            toolCallId: acc.id,
            ...(cancellableRead ? { readAbortSignal: executionStop.signal } : {}),
          });
          if (cancellableRead) {
            let onReadStop!: () => void;
            const interrupted = new Promise<null>((resolve) => {
              onReadStop = () => resolve(null);
              executionStop.signal.addEventListener("abort", onReadStop, { once: true });
              if (executionStop.signal.aborted) onReadStop();
            });
            try {
              const read = await Promise.race([pendingExecution, interrupted]);
              if (!read || stopObserved) break;
              execution = read;
            } finally {
              executionStop.signal.removeEventListener("abort", onReadStop);
            }
          } else {
            execution = await pendingExecution;
          }
        }
        if (await context.shouldStop?.()) observeStop();
        if (stopObserved && (cancellableRead || ledgerClaim.action === "reuse")) break;
        const { result, success, modelResult, pause, secrets } = execution;
        if (pause) pausedByTool = true;

        // Apply redaction before persistence and before sending data back to
        // the model. Reuse the agent's recursive redactor because a live
        // identifier can be nested anywhere in the result.
        for (const secret of secrets ?? []) redactor.add(secret);

        // What the model reads back is not always what the screen shows. A seed
        // proposal (MIN-173) can contain forty titles that would otherwise be
        // resent on every turn. The complete result goes into metadata, where
        // the thread can restore it (`buildToolCallResultsFromMessages`), while
        // `content` carries only what the model needs.
        const forModel = redactDeep(modelResult ?? result, redactor.redact);
        const persistedResult = redactDeep(result, redactor.redact);
        if (ledgerClaim.action === "execute") {
          await context.toolLedger?.complete({
            toolCallId: acc.id,
            success,
            result: persistedResult,
            modelResult: forModel,
            pause: pause === true,
          });
        }
        if (stopObserved) break;
        // Emit only after recording the result and confirming live authority.
        // Fresh secrets remain visible once and never enter later model input.
        emitter.emit("tool_result", {
          id: acc.id,
          name: acc.name,
          result,
          success,
        });
        // A reader following the journal (after a handoff, or a reconnect)
        // gets the redacted result the tool message stores (MIN-1010).
        emitter.journal?.("tool_result", {
          id: acc.id,
          name: acc.name,
          result: persistedResult,
          success,
        });
        if (!alreadyCompleted) {
          await saveToolResultMessage(context, {
            conversation_id: context.conversationId,
            ...(context.turnId ? { turn_id: context.turnId } : {}),
            role: "tool",
            content: JSON.stringify(forModel),
            tool_call_id: acc.id,
            tool_name: acc.name,
            metadata: {
              ...(modelResult === undefined ? { success } : { success, result: persistedResult }),
              // What a later turn reloads (`loadedToolNames`).
              ...(acc.name === SEARCH_TOOLS_NAME && success
                ? { loaded: (result as { loaded?: unknown }).loaded }
                : {}),
            },
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: acc.id,
          name: acc.name,
          content: serializeToolResult(
            forModel,
            getToolResultCharLimit(acc.name, args)
          ),
        });
        completedToolCallIds.add(acc.id);
        await context.persistCheckpoint?.({
          phase: "tools",
          assistantContent: fullContent || null,
          assistantReasoning: roundReasoning,
          assistantMessageId: savedIntermediate.id,
          pendingToolCalls: assistantToolCalls,
          completedToolCallIds: [...completedToolCallIds],
          roundCount,
          completionRepairs,
        });
      }

      // Continue rules:
      // - ask_user, or a tool that hands the turn back: stop and wait for user
      // - other tools: continue with tools enabled; minddy tools chain
      //   legitimately (create issue → set categories → comment)
      if (!hasAskUser && !pausedByTool && !stopObserved && !handingOff) {
        await context.persistCheckpoint?.({ phase: "model", roundCount, completionRepairs });
        continueLoop = true;
      }
      fullContent = "";
      toolCallAccumulators.clear();
    } else {
      finalContent = fullContent;
      finalReasoning = roundReasoning;
    }
  }

  return {
    fullContent: finalContent,
    finalReasoning,
    allToolCalls,
    generations,
    suspension: handingOff ? { kind: "handoff" } : suspension,
  };
  } finally {
    executionClosed = true;
    if (stopPollTimer) clearTimeout(stopPollTimer);
    stopSignalOff?.();
  }
}
