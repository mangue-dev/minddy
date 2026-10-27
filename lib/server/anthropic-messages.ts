import "server-only";

/**
 * Native Anthropic Messages transport behind the shared chat contract (MIN-826).
 *
 * Every surface builds an OpenAI-shaped chat body (`translateAiChatRequest`)
 * and reads an OpenAI-shaped response. Anthropic's OpenAI-compatible endpoint
 * cannot carry Claude's reasoning: it rejects adaptive thinking with a 400 and
 * silently drops every effort field (checked against the API on 2026-10-27).
 * This module therefore converts the body to `POST /v1/messages`, and converts
 * the reply — a JSON message or its event stream — back to the chat
 * completion shape the callers already parse. Nothing above the transport
 * learns that the provider changed.
 *
 * Pure conversions: the network call itself stays in `fetchAiChat`, behind the
 * same guarded provider fetch as every other provider.
 */

export const ANTHROPIC_API_VERSION = "2023-06-01";

type Json = Record<string, unknown>;

interface ChatToolCall {
  id?: unknown;
  function?: { name?: unknown; arguments?: unknown };
}

interface ChatMessage {
  role?: unknown;
  content?: unknown;
  tool_calls?: ChatToolCall[];
  tool_call_id?: unknown;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: Json[];
}

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && (part as Json).type === "text"
      ? String((part as Json).text ?? "")
      : ""))
    .join("");
}

function imageBlock(url: string): Json | null {
  const data = DATA_URL.exec(url);
  if (data) {
    return { type: "image", source: { type: "base64", media_type: data[1], data: data[2] } };
  }
  return /^https:\/\//i.test(url) ? { type: "image", source: { type: "url", url } } : null;
}

/** OpenAI content parts → Anthropic content blocks (text, image, PDF). */
function contentBlocks(content: unknown): Json[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const blocks: Json[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Json;
    if (part.type === "text" && typeof part.text === "string" && part.text) {
      blocks.push({ type: "text", text: part.text });
    } else if (part.type === "image_url") {
      const url = (part.image_url as Json | undefined)?.url;
      const block = typeof url === "string" ? imageBlock(url) : null;
      if (block) blocks.push(block);
    } else if (part.type === "file") {
      const fileData = (part.file as Json | undefined)?.file_data;
      const data = typeof fileData === "string" ? DATA_URL.exec(fileData) : null;
      if (data && data[1] === "application/pdf") {
        blocks.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: data[2] },
        });
      }
    }
  }
  return blocks;
}

function parseArguments(value: unknown): Json {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Json : {};
  } catch {
    return {};
  }
}

/**
 * Chat messages → Messages API `system` + `messages`. System and developer
 * messages are hoisted into `system`; tool results become `tool_result`
 * blocks of a user turn; consecutive turns of one role are merged, as the API
 * requires alternating roles.
 */
export function toAnthropicMessages(messages: unknown[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  const system: string[] = [];
  const out: AnthropicMessage[] = [];
  const push = (role: AnthropicMessage["role"], blocks: Json[]) => {
    if (blocks.length === 0) return;
    const last = out[out.length - 1];
    if (last?.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as ChatMessage;
    if (message.role === "system" || message.role === "developer") {
      const text = textOf(message.content);
      if (text) system.push(text);
    } else if (message.role === "user") {
      push("user", contentBlocks(message.content));
    } else if (message.role === "assistant") {
      const blocks = contentBlocks(message.content);
      for (const call of message.tool_calls ?? []) {
        if (typeof call?.id !== "string" || typeof call.function?.name !== "string") continue;
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input: parseArguments(call.function.arguments),
        });
      }
      push("assistant", blocks);
    } else if (message.role === "tool" && typeof message.tool_call_id === "string") {
      const blocks = contentBlocks(message.content);
      push("user", [{
        type: "tool_result",
        tool_use_id: message.tool_call_id,
        content: blocks.length > 0 ? blocks : [{ type: "text", text: "(empty)" }],
      }]);
    }
  }
  return { system: system.length > 0 ? system.join("\n\n") : undefined, messages: out };
}

function toAnthropicTools(tools: unknown): Json[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Json[] = [];
  for (const raw of tools) {
    const fn = (raw as { function?: Json } | null)?.function;
    if (!fn || typeof fn.name !== "string") continue;
    out.push({
      name: fn.name,
      ...(typeof fn.description === "string" ? { description: fn.description } : {}),
      input_schema: fn.parameters && typeof fn.parameters === "object"
        ? fn.parameters
        : { type: "object", properties: {} },
    });
  }
  return out.length > 0 ? out : undefined;
}

function toAnthropicToolChoice(choice: unknown, parallel: unknown): Json | undefined {
  const disableParallel = parallel === false ? { disable_parallel_tool_use: true } : {};
  if (choice === undefined || choice === "auto") {
    return parallel === false ? { type: "auto", ...disableParallel } : undefined;
  }
  if (choice === "none") return { type: "none" };
  if (choice === "required") return { type: "any", ...disableParallel };
  if (choice && typeof choice === "object") {
    const value = choice as Json;
    const name = (value.function as Json | undefined)?.name;
    if (value.type === "function" && typeof name === "string") {
      return { type: "tool", name, ...disableParallel };
    }
    const allowed = value.allowed_tools as Json | undefined;
    if (value.type === "allowed_tools") {
      return { type: allowed?.mode === "required" ? "any" : "auto", ...disableParallel };
    }
  }
  return undefined;
}

function toAnthropicOutputFormat(format: unknown): Json | undefined {
  if (!format || typeof format !== "object") return undefined;
  const value = format as Json;
  const schema = (value.json_schema as Json | undefined)?.schema;
  return value.type === "json_schema" && schema && typeof schema === "object"
    ? { type: "json_schema", schema }
    : undefined;
}

/**
 * The translated chat body → a Messages API body. Reasoning arrives already
 * native (`thinking`, `output_config.effort`, set by `lib/ai-chat.ts`); the
 * rest is structural conversion. OpenAI-only fields (`usage`,
 * `stream_options`, `response_format` without a schema) have no equivalent
 * and are dropped.
 */
export function toAnthropicMessagesBody(body: Json): Json {
  const { system, messages } = toAnthropicMessages(Array.isArray(body.messages) ? body.messages : []);
  const outputFormat = toAnthropicOutputFormat(body.response_format);
  const outputConfig = {
    ...(body.output_config && typeof body.output_config === "object" ? body.output_config as Json : {}),
    ...(outputFormat ? { format: outputFormat } : {}),
  };
  const tools = toAnthropicTools(body.tools);
  const toolChoice = tools ? toAnthropicToolChoice(body.tool_choice, body.parallel_tool_calls) : undefined;
  const stop = typeof body.stop === "string" ? [body.stop] : Array.isArray(body.stop) ? body.stop : undefined;
  return {
    model: body.model,
    max_tokens: body.max_tokens ?? body.max_completion_tokens,
    ...(system ? { system } : {}),
    messages,
    ...(body.stream === true ? { stream: true } : {}),
    ...(tools ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    ...(typeof body.temperature === "number" ? { temperature: body.temperature } : {}),
    ...(stop && stop.length > 0 ? { stop_sequences: stop } : {}),
    ...(body.thinking ? { thinking: body.thinking } : {}),
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    // Automatic prompt caching: Numo resends the same system prompt and tool
    // list on every round, which this caches at a tenth of the input price.
    cache_control: { type: "ephemeral" },
  };
}

/** Messages API stop reason → chat completion `finish_reason`. */
export function toChatFinishReason(stopReason: unknown): string {
  switch (stopReason) {
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length";
    case "refusal":
      return "content_filter";
    default:
      return "stop";
  }
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function toChatUsage(usage: AnthropicUsage) {
  const prompt = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
    + (usage.cache_creation_input_tokens ?? 0);
  const completion = usage.output_tokens ?? 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion };
}

/** A non-streaming Messages API reply → a chat completion object. */
export function toChatCompletion(message: Json): Json {
  const content = Array.isArray(message.content) ? message.content as Json[] : [];
  const text = content.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
  const reasoning = content.filter((b) => b.type === "thinking")
    .map((b) => String(b.thinking ?? "")).join("");
  const toolCalls = content.filter((b) => b.type === "tool_use").map((b) => ({
    id: b.id,
    type: "function",
    function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
  }));
  return {
    id: message.id,
    object: "chat.completion",
    model: message.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: text || null,
        ...(reasoning ? { reasoning } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toChatFinishReason(message.stop_reason),
    }],
    usage: toChatUsage((message.usage ?? {}) as AnthropicUsage),
  };
}

/** An Anthropic error body → the OpenAI error shape callers log and match. */
export function toChatErrorBody(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: { type?: string; message?: string } };
    if (parsed.error) {
      return JSON.stringify({
        error: { message: parsed.error.message ?? "", type: parsed.error.type ?? "api_error", code: parsed.error.type ?? null },
      });
    }
  } catch {
    // Not JSON: forwarded as is below.
  }
  return text;
}

/**
 * Messages API event stream → chat completion chunks (`data: {...}` lines,
 * ending with `data: [DONE]`). Thinking deltas travel as `delta.reasoning`,
 * the field the Numo loop already streams into its reasoning feed; tool uses
 * become indexed `tool_calls` deltas; the final chunk carries the usage.
 */
export function toChatCompletionStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let id = "";
  let model = "";
  let usage: AnthropicUsage = {};
  let toolIndex = -1;
  const toolIndexByBlock = new Map<number, number>();

  const chunk = (delta: Json, extra: Json = {}) =>
    encoder.encode(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", model,
      choices: [{ index: 0, delta, finish_reason: null }],
      ...extra,
    })}\n\n`);

  const handle = (event: Json, emit: (bytes: Uint8Array) => void) => {
    switch (event.type) {
      case "message_start": {
        const message = (event.message ?? {}) as Json;
        id = String(message.id ?? "");
        model = String(message.model ?? "");
        usage = { ...(message.usage as AnthropicUsage | undefined) };
        emit(chunk({ role: "assistant" }));
        break;
      }
      case "content_block_start": {
        const block = (event.content_block ?? {}) as Json;
        if (block.type === "tool_use") {
          toolIndex += 1;
          toolIndexByBlock.set(Number(event.index), toolIndex);
          emit(chunk({
            tool_calls: [{
              index: toolIndex, id: block.id, type: "function",
              function: { name: block.name, arguments: "" },
            }],
          }));
        }
        break;
      }
      case "content_block_delta": {
        const delta = (event.delta ?? {}) as Json;
        if (delta.type === "text_delta" && typeof delta.text === "string") {
          emit(chunk({ content: delta.text }));
        } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
          emit(chunk({ reasoning: delta.thinking }));
        } else if (delta.type === "input_json_delta" && typeof delta.partial_json === "string") {
          const index = toolIndexByBlock.get(Number(event.index));
          if (index !== undefined) {
            emit(chunk({ tool_calls: [{ index, function: { arguments: delta.partial_json } }] }));
          }
        }
        break;
      }
      case "message_delta": {
        usage = { ...usage, ...(event.usage as AnthropicUsage | undefined) };
        const stopReason = (event.delta as Json | undefined)?.stop_reason;
        if (stopReason !== undefined && stopReason !== null) {
          emit(encoder.encode(`data: ${JSON.stringify({
            id, object: "chat.completion.chunk", model,
            choices: [{ index: 0, delta: {}, finish_reason: toChatFinishReason(stopReason) }],
          })}\n\n`));
        }
        break;
      }
      case "message_stop":
        emit(encoder.encode(`data: ${JSON.stringify({
          id, object: "chat.completion.chunk", model, choices: [], usage: toChatUsage(usage),
        })}\n\ndata: [DONE]\n\n`));
        break;
      case "error": {
        const error = (event.error ?? {}) as Json;
        emit(encoder.encode(`data: ${JSON.stringify({
          error: { message: String(error.message ?? "Anthropic stream error"), type: error.type ?? "api_error" },
        })}\n\n`));
        break;
      }
      default:
        // `ping` and `content_block_stop` carry nothing the chat shape needs.
        break;
    }
  };

  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    // A pull that enqueues nothing is not called again, so this one reads
    // until it emits a chunk or the source ends: a network chunk without a
    // complete event line would otherwise stall the stream for good.
    async pull(controller) {
      let emitted = false;
      const emit = (bytes: Uint8Array) => {
        emitted = true;
        controller.enqueue(bytes);
      };
      while (!emitted) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            handle(JSON.parse(line.slice(5).trim()) as Json, emit);
          } catch {
            // A malformed event is skipped, like the chat parser skips one.
          }
        }
        if (done) {
          controller.close();
          return;
        }
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/**
 * Wraps a Messages API response so it reads as a chat completions response:
 * the same status and headers, with a converted body. Errors keep their
 * status and are rewritten to the OpenAI error shape.
 */
export async function toChatCompletionsResponse(
  response: Response,
  stream: boolean,
): Promise<Response> {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  if (!response.ok) {
    headers.set("content-type", "application/json");
    return new Response(toChatErrorBody(await response.text()), {
      status: response.status, statusText: response.statusText, headers,
    });
  }
  if (stream && response.body) {
    headers.set("content-type", "text/event-stream");
    return new Response(toChatCompletionStream(response.body), {
      status: response.status, statusText: response.statusText, headers,
    });
  }
  headers.set("content-type", "application/json");
  const message = await response.json() as Json;
  return new Response(JSON.stringify(toChatCompletion(message)), {
    status: response.status, statusText: response.statusText, headers,
  });
}
