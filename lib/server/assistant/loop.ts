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
import {
  getToolResultCharLimit,
  serializeToolResult,
} from "./tool-result-serialization";

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
  allToolCalls: AssistantToolCall[];
  generations: GenerationInfo[];
}

/** Module-level cache — OpenRouter model list is fetched at most once per
    process (on success), then feeds both capability lookups below. */
const modelIndexCache = new Map<
  string,
  { caching: boolean; modalities: string[] }
>();
let modelIndexLoaded = false;

async function loadModelIndex(apiKey: string): Promise<void> {
  if (modelIndexLoaded) return;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
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
  /** Solved by the way. Optional for internal calls/historical tests. */
  aiRuntime?: ResolvedAiRuntime;
}

/**
 * The agentic while-loop: stream one OpenRouter completion, forward deltas to
 * the client as SSE, execute any tool calls, persist every intermediate
 * message, feed results back, and repeat (max 6 rounds). `ask_user` pauses the
 * loop — the user's answer arrives as the next POST.
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
  const allToolCalls: AssistantToolCall[] = [];
  let continueLoop = true;
  let roundCount = 0;
  // The template sent, including routing suffix (MIN-263) — it may lose its
  // suffix being looped if OpenRouter refuses it.
  let requestModel = context.model;
  const MAX_TOOL_ROUNDS = 6;
  // Living IDs seen during the tour (MIN-343). The register is
  // CUMULATIVE on purpose: a key returned in round 1 must remain substituted in
  // what a round 3 `list_integrations` would rewrite.
  const redactor = new SecretRedactor();

  while (continueLoop) {
    continueLoop = false;
    roundCount++;

    const call = await fetchAiChat(
      aiRuntime,
      requestModel,
      (m) => ({
        model: m,
        messages,
        stream: true,
        maxOutputTokens: 4096,
        ...(tools.length > 0 ? { tools } : {}),
      }),
      "Numo (minddy)",
      "[assistant]",
    );
    const response = call.response;
    // The fallback of the routing shortcut sticks to the model that worked: without that,
    // each round of the loop would repay a refused request.
    requestModel = call.model;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `LLM error (${response.status}): ${errorText.slice(0, 200)}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body from LLM");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
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

        if (parsed.id && !generationId) {
          generationId = parsed.id;
        }
        if (parsed.model) {
          modelUsed = parsed.model;
        }
        if (parsed.usage) {
          usageInfo = parsed.usage;
        }

        const delta = parsed.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullContent += delta.content;
          emitter.emit("content_delta", { delta: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulators.has(idx)) {
              toolCallAccumulators.set(idx, {
                id: tc.id || "",
                name: tc.function?.name || "",
                arguments: "",
              });
              if (tc.id && tc.function?.name) {
                emitter.emit("tool_call_start", {
                  id: tc.id,
                  name: tc.function.name,
                });
              }
            }

            const acc = toolCallAccumulators.get(idx)!;
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) {
              acc.arguments += tc.function.arguments;
              emitter.emit("tool_call_args_delta", {
                id: acc.id,
                delta: tc.function.arguments,
              });
            }
          }
        }
      }
    }

    generations.push({
      generationId,
      model: modelUsed,
      promptTokens: usageInfo?.prompt_tokens ?? null,
      completionTokens: usageInfo?.completion_tokens ?? null,
      totalTokens: usageInfo?.total_tokens ?? null,
      cost: usageInfo?.cost ?? null,
    });

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

      // Save intermediate assistant message with tool_calls to DB
      const { data: savedIntermediate } = await context.service
        .from("assistant_messages")
        .insert({
          conversation_id: context.conversationId,
          role: "assistant",
          content: fullContent || null,
          tool_calls: assistantToolCalls,
        })
        .select("id")
        .single();

      if (savedIntermediate) {
        emitter.emit("message_complete", {
          message_id: savedIntermediate.id,
        });
      }

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

          await context.service.from("assistant_messages").insert({
            conversation_id: context.conversationId,
            role: "tool",
            content: JSON.stringify(askResult),
            tool_call_id: acc.id,
            tool_name: "ask_user",
            metadata: { success: true },
          });

          messages.push({
            role: "tool",
            tool_call_id: acc.id,
            content: serializeToolResult(askResult),
          });
          continue;
        }

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(acc.arguments);
        } catch {
          // Invalid JSON from LLM
        }

        const { result, success, modelResult, pause, secrets }: ToolExecution =
          await executeTool(acc.name, args, context);
        // The COMPLETE result goes to the browser, secret included: this is the
        // only place where a fresh key should appear, live, once
        // (MIN-343). Nothing that follows will see him again.
        emitter.emit("tool_result", {
          id: acc.id,
          name: acc.name,
          result,
          success,
        });
        if (pause) pausedByTool = true;

        // The substitution, applied BEFORE the base and BEFORE the model. She is
        // that of the agent (`redactDeep`), not a second written next to it: a
        // living identifier can be nested anywhere in the result.
        for (const secret of secrets ?? []) redactor.add(secret);

        // What the MODEL reads back is not always what the screen shows: a
        // proposition d'amorce (MIN-173) fait quarante titres qu'il vient
        // to write, and that history would serve him again at every turn. THE
        // complete result then goes to the metadata, from where the thread reads it again
        // (`buildToolCallResultsFromMessages`), and `content` only carries what
        // the model needs to know.
        const forModel = redactDeep(modelResult ?? result, redactor.redact);
        await context.service.from("assistant_messages").insert({
          conversation_id: context.conversationId,
          role: "tool",
          content: JSON.stringify(forModel),
          tool_call_id: acc.id,
          tool_name: acc.name,
          metadata:
            modelResult === undefined
              ? { success }
              : { success, result: redactDeep(result, redactor.redact) },
        });

        messages.push({
          role: "tool",
          tool_call_id: acc.id,
          content: serializeToolResult(
            forModel,
            getToolResultCharLimit(acc.name, args)
          ),
        });
      }

      // Continue rules:
      // - ask_user, or a tool that hands the turn back: stop and wait for user
      // - other tools: continue normally with tools enabled (round cap only —
      //   minddy tools chain legitimately: create issue → set categories → comment)
      if (!hasAskUser && !pausedByTool && roundCount < MAX_TOOL_ROUNDS) {
        continueLoop = true;
      }
      fullContent = "";
      toolCallAccumulators.clear();
    } else {
      finalContent = fullContent;
    }
  }

  return { fullContent: finalContent, allToolCalls, generations };
}
