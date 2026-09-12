import "server-only";

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
import { stripModelSuffix } from "@/lib/ai-model-config";
import { fetchAiChat, type ResolvedAiRuntime } from "@/lib/server/ai-runtime";
import { fetchAiProviderBytes } from "@/lib/server/ai-provider-request";
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

/** Module-level cache — OpenRouter model list is fetched at most once per
    process (on success), then feeds both capability lookups below. */
const modelIndexCache = new Map<
  string,
  { caching: boolean; modalities: string[] }
>();
let modelIndexLoaded = false;
const MAX_MODEL_INDEX_BYTES = 5 * 1024 * 1024;

async function loadModelIndex(apiKey: string): Promise<void> {
  if (modelIndexLoaded) return;
  try {
    const res = await fetchAiProviderBytes(
      "openrouter",
      "https://openrouter.ai/api/v1/models",
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        maxBytes: MAX_MODEL_INDEX_BYTES,
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = JSON.parse(res.bytes.toString("utf8")) as {
      data?: Array<{
        id: string;
        pricing?: { input_cache_read?: string | number };
        architecture?: { input_modalities?: string[] };
      }>;
    };
    for (const m of body.data ?? []) {
      modelIndexCache.set(m.id, {
        caching: Number(m.pricing?.input_cache_read ?? 0) > 0,
        modalities: m.architecture?.input_modalities ?? ["text"],
      });
    }
    modelIndexLoaded = true;
  } catch {
    // Left unloaded — callers fall back to the conservative default and the
    // next call retries the fetch.
  }
}

/**
 * Returns true if the model supports explicit prompt caching via cache_control,
 * detected from OpenRouter's pricing metadata (input_cache_read > 0).
 */
export async function modelSupportsCaching(
  model: string,
  apiKey: string
): Promise<boolean> {
  await loadModelIndex(apiKey);
  // The NU id: the OpenRouter catalog does not know the routing shortcuts
  // (`…:nitro`, MIN-263), and a failed lookup would cut off the cache without saying anything.
  return modelIndexCache.get(stripModelSuffix(model))?.caching ?? false;
}

/**
 * The model's input modalities per OpenRouter ("text", "image", "file"…) —
 * gates whether attachments are sent as image/file parts or degraded to text
 * notes. Falls back to text-only when the index is unavailable.
 */
export async function getModelInputModalities(
  model: string,
  apiKey: string
): Promise<Set<string>> {
  await loadModelIndex(apiKey);
  // Same: without the bare id, a suffixed model would pass as text alone and the
  // attachments would be degraded to notes.
  return new Set(modelIndexCache.get(stripModelSuffix(model))?.modalities ?? ["text"]);
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
}

const RETRYABLE_READ_TOOLS = new Set([
  "get_help",
  "list_projects",
  "list_global_filter_options",
  "list_views",
  "get_account_settings",
  "list_inbox",
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
  "read_pull_request",
  "propose_backlog",
  "web_search",
  // The durable parent turn/tool-call pair is a database uniqueness key on
  // delegated workers. Re-delivery resolves the original run instead of
  // launching another one, including after a process dies before ledger commit.
  "launch_code_agent",
]);

export function toolReplayPolicy(toolName: string): "retry" | "reconcile" {
  return RETRYABLE_READ_TOOLS.has(toolName) ? "retry" : "reconcile";
}

async function saveToolResultMessage(
  context: ProcessChatContext,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await context.service.from("assistant_messages").insert(row);
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

  while (continueLoop) {
    continueLoop = false;
    if (await context.shouldStop?.()) break;
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
      const call = await fetchAiChat(
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
      );
      const response = call.response;
      requestModel = call.model;
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM error (${response.status}): ${errorText.slice(0, 200)}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body from LLM");

      const decoder = new TextDecoder();
      let buffer = "";
      const reasoningStream = new AssistantReasoningStream(emitter);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;
            if (typeof delta.reasoning === "string" && delta.reasoning) {
              reasoningStream.push(delta.reasoning);
            }
            if (delta.content) {
              roundReasoning = reasoningStream.finish();
              fullContent += delta.content;
              emitter.emit("content_delta", { delta: delta.content });
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
        roundReasoning = reasoningStream.finish();
      }
      generations.push({
        generationId,
        model: modelUsed,
        promptTokens: usageInfo?.prompt_tokens ?? null,
        completionTokens: usageInfo?.completion_tokens ?? null,
        totalTokens: usageInfo?.total_tokens ?? null,
        cost: usageInfo?.cost ?? null,
      });
    }

    // Process completed tool calls
    if (toolCallAccumulators.size > 0) {
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
        const { data, error } = await context.service
          .from("assistant_messages")
          .insert({
            conversation_id: context.conversationId,
            ...(context.turnId ? { turn_id: context.turnId } : {}),
            role: "assistant",
            content: fullContent || null,
            tool_calls: assistantToolCalls,
            ...(roundReasoning ? { metadata: { reasoning: roundReasoning } } : {}),
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

      // Execute each tool and save results to DB
      for (const [, acc] of toolCallAccumulators) {
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
        if (acc.name === "launch_code_agent" && success) {
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
      if (!hasAskUser && !pausedByTool && roundCount <= MAX_TOOL_EXECUTION_ROUNDS) {
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
