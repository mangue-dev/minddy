import "server-only";
import { visibleAssistantContent } from "./visible-content";
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
import { redactDeep, SecretRedactor } from "@/lib/server/agent/redact";
import { fetchAiChat, type ResolvedAiRuntime } from "@/lib/server/ai-runtime";
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
  | { kind: "work"; runId: string };

export interface ProcessChatCheckpoint {
  phase: "model" | "tools";
  assistantContent?: string | null;
  assistantReasoning?: AssistantReasoning | null;
  assistantMessageId?: string | null;
  pendingToolCalls?: AssistantToolCall[];
  completedToolCallIds?: string[];
  roundCount?: number;
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
 * Ceiling between two `shouldStop` polls while streaming. A stop requested
 * while a round streams must abort the provider request promptly instead of
 * waiting for the round to finish on its own.
 */
const STOP_POLL_INTERVAL_MS = 1_000;

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
  }) => Promise<string>;
  registerActiveRun?: (runId: string) => void;
  toolLedger?: ToolExecutionLedger;
  shouldStop?: () => Promise<boolean>;
  /**
   * Registers a synchronous stop listener, called the instant a stop request
   * lands in this process. The loop uses it to resolve a pending blocked
   * stream read immediately instead of waiting for the next chunk (or the
   * next polled `shouldStop` after it) to notice.
   */
  onStopSignal?: (notify: () => void) => () => void;
  /** Budget gate immediately before every provider generation. */
  beforeGeneration?: (roundCount: number) => Promise<void>;
  /** Persist one generation before any tool it requested can launch work. */
  onGeneration?: (
    generation: GenerationInfo,
    roundCount: number,
  ) => Promise<void>;
}

const RETRYABLE_READ_TOOLS = new Set([
  "get_help",
  "list_projects",
  "list_global_filter_options",
  "list_views",
  "get_account_settings",
  "list_inbox",
  "get_user_stats",
  "get_plan_usage",
  "list_trash",
  "list_agent_models",
  "get_cycle",
  "get_scratchpad",
  "list_issues",
  "search_issues",
  "get_issue",
  "list_members",
  "list_objectives",
  "list_categories",
  "list_integrations",
  "list_feedback",
  "get_feedback",
  "get_feedback_board",
  "list_pages",
  "get_page",
  "search_pages",
  "list_routines",
  "list_routine_runs",
  "read_routine_occurrence",
  "read_pull_request",
  "propose_backlog",
  "web_search",
  // The durable parent turn/tool-call pair is a database uniqueness key on
  // delegated workers. Re-delivery resolves the original run instead of
  // launching another one, including after a process dies before ledger commit.
  "launch_code_agent",
  "answer_code_worker",
  // A repeated report targets the same operation row and payload.
  "report_automation_outcome",
]);

export function toolReplayPolicy(toolName: string): "retry" | "reconcile" {
  return RETRYABLE_READ_TOOLS.has(toolName) ? "retry" : "reconcile";
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
 * The agentic while-loop: stream one OpenRouter completion, forward deltas to
 * the client as SSE, execute any tool calls, persist every intermediate
 * message, feed results back, and repeat within a bounded tool budget. A final
 * text-only round always closes the turn. `ask_user` pauses the loop — the
 * user's answer arrives as the next POST.
 */
export async function processChat(
  messages: ChatMessage[],
  tools: AssistantToolDef[],
  emitter: SafeEmitter,
  context: ProcessChatContext
): Promise<ProcessChatResult> {
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
  const MAX_TOOL_EXECUTION_ROUNDS = 12;
  const reasoningLevel = context.reasoningLevel ?? DEFAULT_REASONING_LEVEL;
  // Living IDs seen during the tour (MIN-343). The register is
  // CUMULATIVE on purpose: a key returned in round 1 must remain substituted in
  // what a round 3 `list_integrations` would rewrite.
  const redactor = new SecretRedactor();
  let suspension: ProcessChatSuspension | null = null;
  let resumeCheckpoint = context.resumeCheckpoint ?? null;
  // True as soon as a stop was observed anywhere in the round (mid-stream or
  // between tools): the loop stops handing the turn back with no persisted
  // work beyond the durable checkpoints already written.
  let stopObserved = false;

  while (continueLoop) {
    continueLoop = false;
    stopObserved = (await context.shouldStop?.()) ?? false;
    if (stopObserved) break;
    const resumingTools = resumeCheckpoint?.phase === "tools";
    roundCount = resumingTools
      ? Math.max(roundCount, resumeCheckpoint?.roundCount ?? 1)
      : roundCount + 1;
    // Always reserve one text-only round after the tool budget. Previously the
    // sixth tool round ended the stream silently, with no final assistant reply.
    const forceConclusion = roundCount > MAX_TOOL_EXECUTION_ROUNDS;

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
    } | null = null;
    let modelUsed: string | null = null;
    const toolCallAccumulators: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();
    let roundReasoning: AssistantReasoning | null = resumingTools
      ? resumeCheckpoint?.assistantReasoning ?? null
      : null;

    if (resumingTools) {
      for (const [index, call] of (resumeCheckpoint?.pendingToolCalls ?? []).entries()) {
        toolCallAccumulators.set(index, {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    } else {
      // One controller per generation round: it carries both the idle watchdog
      // and a mid-stream stop. Aborting the signal destroys the pinned socket,
      // which is what makes a hung stream, or a stop request, observable here.
      const generationController = new AbortController();
      let idleTimer: ReturnType<typeof setTimeout> | null = null;
      let idleAborted = false;
      let stopPollTimer: ReturnType<typeof setTimeout> | null = null;
      let roundClosed = false;
      const observeStop = () => {
        stopObserved = true;
        generationController.abort();
      };
      // Poll independently of headers and body reads: serverless stop requests
      // can land in another process while the provider stays completely silent.
      const pollStop = async () => {
        try {
          if (await context.shouldStop?.()) observeStop();
        } catch {
          // A transient database failure is retried on the next poll.
        } finally {
          if (!roundClosed && !stopObserved) {
            stopPollTimer = setTimeout(() => { void pollStop(); }, STOP_POLL_INTERVAL_MS);
          }
        }
      };
      const closeRound = () => {
        roundClosed = true;
        if (stopPollTimer) clearTimeout(stopPollTimer);
        if (idleTimer) clearTimeout(idleTimer);
        stopSignalOff?.();
      };
      const armIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          idleAborted = true;
          generationController.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };
      armIdleTimer();
      // Event-driven stop must be armed BEFORE the provider request: a stop
      // submitted while `fetchAiChat` still awaits response headers aborts the
      // connection attempt itself instead of waiting for the headers (or the
      // idle watchdog) to free it. The listener stays armed for the whole
      // round, and every exit path below disarms it.
      const stopSignalOff = context.onStopSignal?.(observeStop) ?? null;
      stopPollTimer = setTimeout(() => { void pollStop(); }, STOP_POLL_INTERVAL_MS);
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
        call = await fetchAiChat(
          aiRuntime,
          requestModel,
          (m) => ({
            model: m,
            messages,
            stream: true,
            maxOutputTokens: reasoningMaxTokens(4096, reasoningLevel),
            reasoning: { effort: reasoningLevel },
            ...(tools.length > 0 && !forceConclusion ? { tools } : {}),
          }),
          "Numo (minddy)",
          "[assistant]",
          { signal: generationController.signal },
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
      // These early exits leave before the stream try/finally disarms the
      // watchdog: without an explicit cleanup every provider refusal would
      // keep a 90 s timer armed on an already-abandoned controller. The stop
      // listener is also dropped: nothing below subscribes anymore.
      if (!response.ok) {
        closeRound();
        const errorText = await response.text();
        throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
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
          if (done || stopObserved) break;
          armIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            if (parsed.id && !generationId) generationId = parsed.id;
            if (parsed.model) modelUsed = parsed.model;
            if (parsed.usage) usageInfo = parsed.usage;
            // OpenRouter reports mid-stream provider failures in-band: a
            // top-level `error` beside the choice, with `finish_reason:
            // "error"` and no usable content. Swallowing it would surface a
            // silently truncated reply, so it goes through the durable retry
            // path like any other generation failure.
            const streamError = parsed.error
              ?? (parsed.choices?.[0]?.finish_reason === "error"
                ? { message: "The provider disconnected mid-stream" }
                : null);
            if (streamError) {
              throw new Error(
                `LLM stream error: ${String(streamError.message ?? "unknown provider error").slice(0, 200)}`,
              );
            }
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.reasoning === "string" && delta.reasoning) {
              reasoningStream.push(delta.reasoning);
            }
            if (delta.content) {
              roundReasoning = reasoningStream.finish();
              rawContent += delta.content;
              const visible = visibleAssistantContent(rawContent);
              const visibleDelta = visible.slice(fullContent.length);
              fullContent = visible;
              if (visibleDelta) emitter.emit("content_delta", { delta: visibleDelta });
            }
            if (delta.tool_calls) {
              roundReasoning = reasoningStream.finish();
              for (const tc of delta.tool_calls) {
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
                if (tc.function?.name) acc.name = tc.function.name;
                if (tc.function?.arguments) {
                  acc.arguments += tc.function.arguments;
                  emitter.emit("tool_call_args_delta", { id: acc.id, delta: tc.function.arguments });
                }
              }
            }
          }
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
      };
      generations.push(generation);
      await context.onGeneration?.(generation, roundCount);
      if (stopObserved) {
        // The stop was requested while this round streamed: hand the turn back
        // without persisting a partial round. `executeNumoTurnCore` observes
        // the pending stop, interrupts any active worker and checkpoints
        // `stopped`.
        break;
      }
    }

    // Process completed tool calls
    if (toolCallAccumulators.size > 0 && !stopObserved) {
      const assistantToolCalls: AssistantToolCall[] = [];
      for (const [, acc] of toolCallAccumulators) {
        if (acc.name === "ask_user" && context.workerInput) {
          try {
            acc.arguments = JSON.stringify({
              ...JSON.parse(acc.arguments),
              _worker_input: {
                parent_turn_id: context.workerInput.parentTurnId,
                run_id: context.workerInput.runId,
                question_id: context.workerInput.questionId,
              },
            });
          } catch {
            // Invalid arguments remain invalid and the ordinary ask_user parser
            // will render no question instead of attaching false correlation.
          }
        }
        emitter.emit("tool_call_complete", {
          id: acc.id,
          name: acc.name,
          arguments: acc.arguments,
        });
        assistantToolCalls.push({
          id: acc.id,
          type: "function",
          function: { name: acc.name, arguments: acc.arguments },
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
        });
      }
      resumeCheckpoint = null;

      // Add to chat history for LLM context
      messages.push({
        role: "assistant",
        content: fullContent || null,
        tool_calls: assistantToolCalls,
      });

      allToolCalls.push(...assistantToolCalls);

      // ask_user pauses immediately: the loop stops and waits for the user.
      const hasAskUser = [...toolCallAccumulators.values()].some(
        (acc) => acc.name === "ask_user"
      );
      // A tool can also help (propose_backlog, MIN-173): this
      // which it puts before the user's eyes awaits his gesture.
      let pausedByTool = false;

      // Execute each tool and save results to DB. A stop requested while a
      // slow tool runs must not wait for the round to finish executing: the
      // check between tools shortens the wait to at most one tool.
      for (const [, acc] of toolCallAccumulators) {
        if (await context.shouldStop?.()) break;
        const alreadyCompleted = completedToolCallIds.has(acc.id);
        if (acc.name === "ask_user") {
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
          emitter.emit("tool_result", {
            id: acc.id,
            name: "ask_user",
            result: askResult,
            success: true,
          });

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
        const ledgerClaim = context.toolLedger
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
        if (ledgerClaim.action === "lost_claim") {
          throw new Error("Numo turn execution claim was lost");
        }
        if (ledgerClaim.action === "reuse" && ledgerClaim.execution) {
          execution = ledgerClaim.execution;
        } else {
          execution = await executeTool(acc.name, args, {
            ...context,
            toolCallId: acc.id,
          });
        }
        const { result, success, modelResult, pause, secrets } = execution;
        // The complete result goes to the browser with any secret included.
        // This is the only place where a fresh key appears live, once
        // (MIN-343). Nothing later can see it again.
        emitter.emit("tool_result", {
          id: acc.id,
          name: acc.name,
          result,
          success,
        });
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
        if (!alreadyCompleted) {
          await saveToolResultMessage(context, {
            conversation_id: context.conversationId,
            ...(context.turnId ? { turn_id: context.turnId } : {}),
            role: "tool",
            content: JSON.stringify(forModel),
            tool_call_id: acc.id,
            tool_name: acc.name,
            metadata:
              modelResult === undefined
                ? { success }
                : { success, result: persistedResult },
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: acc.id,
          content: serializeToolResult(
            forModel,
            getToolResultCharLimit(acc.name, args)
          ),
        });
        completedToolCallIds.add(acc.id);
        if (
          (acc.name === "launch_code_agent" || acc.name === "answer_code_worker")
          && success
        ) {
          const runId = (result as { run_id?: unknown } | null)?.run_id;
          if (typeof runId === "string" && runId) {
            suspension = { kind: "work", runId };
            pausedByTool = true;
            context.registerActiveRun?.(runId);
          }
        }
        await context.persistCheckpoint?.({
          phase: "tools",
          assistantContent: fullContent || null,
          assistantReasoning: roundReasoning,
          assistantMessageId: savedIntermediate.id,
          pendingToolCalls: assistantToolCalls,
          completedToolCallIds: [...completedToolCallIds],
          roundCount,
        });
      }

      // Continue rules:
      // - ask_user, or a tool that hands the turn back: stop and wait for user
      // - other tools: continue normally with tools enabled (round cap only —
      //   minddy tools chain legitimately: create issue → set categories → comment)
      if (!hasAskUser && !pausedByTool && !stopObserved && roundCount <= MAX_TOOL_EXECUTION_ROUNDS) {
        await context.persistCheckpoint?.({ phase: "model", roundCount });
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
    suspension,
  };
}
