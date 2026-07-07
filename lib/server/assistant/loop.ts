import "server-only";

import type { AssistantToolCall } from "@/lib/assistant-types";
import type { SafeEmitter } from "./sse";
import {
  executeTool,
  type ToolContext,
  type ToolExecution,
} from "./execute-tool";
import type { AssistantToolDef } from "./tools";

// ── OpenRouter streaming agent loop (ported from AutoKap's assistant) ───

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
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
}

export interface ProcessChatResult {
  fullContent: string;
  allToolCalls: AssistantToolCall[];
  generations: GenerationInfo[];
}

/** Module-level cache — OpenRouter model list is fetched at most once per process. */
const cachingCapabilityCache = new Map<string, boolean>();

/**
 * Returns true if the model supports explicit prompt caching via cache_control,
 * detected from OpenRouter's pricing metadata (input_cache_read > 0).
 * Memoised for the lifetime of the process.
 */
export async function modelSupportsCaching(
  model: string,
  apiKey: string
): Promise<boolean> {
  if (cachingCapabilityCache.has(model)) return cachingCapabilityCache.get(model)!;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      data?: Array<{ id: string; pricing?: { input_cache_read?: string | number } }>;
    };
    for (const m of body.data ?? []) {
      cachingCapabilityCache.set(m.id, Number(m.pricing?.input_cache_read ?? 0) > 0);
    }
    return cachingCapabilityCache.get(model) ?? false;
  } catch {
    return false;
  }
}

/** Cap tool result JSON sent to the LLM. The full result is already persisted in DB. */
export function serializeToolResult(result: unknown, maxChars = 4000): string {
  const full = JSON.stringify(result);
  if (full.length <= maxChars) return full;
  return full.slice(0, maxChars) + "... [truncated]";
}

function getToolResultCharLimit(toolName: string): number {
  switch (toolName) {
    // Issue lists must never reach the LLM truncated mid-array — a partial id
    // list makes the model hallucinate issue ids on the next write.
    case "list_issues":
    case "search_issues":
    case "get_issue":
      return 12000;
    default:
      return 4000;
  }
}

export interface ProcessChatContext extends ToolContext {
  model: string;
  conversationId: string;
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
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const generations: GenerationInfo[] = [];
  let finalContent = "";
  const allToolCalls: AssistantToolCall[] = [];
  let continueLoop = true;
  let roundCount = 0;
  const MAX_TOOL_ROUNDS = 6;

  while (continueLoop) {
    continueLoop = false;
    roundCount++;

    const requestBody: Record<string, unknown> = {
      model: context.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 4096,
    };
    if (tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://minddy.app",
        "X-Title": "Numo (minddy)",
      },
      body: JSON.stringify(requestBody),
    });

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

      // Execute each tool and save results to DB
      for (const [, acc] of toolCallAccumulators) {
        if (acc.name === "ask_user") {
          // ask_user: emit a synthetic result and do NOT continue the loop
          let question = "";
          try {
            const parsed = JSON.parse(acc.arguments);
            question = (parsed.question as string) || "";
          } catch {
            // Invalid JSON from LLM
          }

          const askResult = { status: "awaiting_user_response", question };
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

        const { result, success }: ToolExecution = await executeTool(
          acc.name,
          args,
          context
        );
        emitter.emit("tool_result", {
          id: acc.id,
          name: acc.name,
          result,
          success,
        });

        // Save tool result message to DB
        await context.service.from("assistant_messages").insert({
          conversation_id: context.conversationId,
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: acc.id,
          tool_name: acc.name,
          metadata: { success },
        });

        messages.push({
          role: "tool",
          tool_call_id: acc.id,
          content: serializeToolResult(
            result,
            getToolResultCharLimit(acc.name)
          ),
        });
      }

      // Continue rules:
      // - ask_user: stop and wait for user
      // - other tools: continue normally with tools enabled (round cap only —
      //   minddy tools chain legitimately: create issue → set categories → comment)
      if (!hasAskUser && roundCount < MAX_TOOL_ROUNDS) {
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
