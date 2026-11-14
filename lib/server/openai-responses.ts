import "server-only";

/**
 * OpenAI Responses API transport behind the shared chat contract (MIN-979).
 *
 * GPT-6 Astra and the GPT-6.1 models call tools only through `POST
 * /v1/responses`, and GPT-5.6, GPT-6 Sol and GPT-6 Luna can reason while
 * calling tools only there (on Chat Completions they need
 * `reasoning_effort: "none"`). Every surface still builds an OpenAI chat body
 * (`translateAiChatRequest`) and reads a chat completion: this module converts
 * the body to a Responses request, and converts the reply — a JSON response or
 * its event stream — back, like `anthropic-messages.ts` does for Claude.
 *
 * Requests are stateless (`store: false`). Reasoning items come back with
 * `encrypted_content`; they travel in the chat shape as `reasoning_details`
 * and are sent back, unchanged and with their id, on the next round of a tool
 * turn.
 */

type Json = Record<string, unknown>;

export const OPENAI_REASONING_FORMAT = "openai-responses-v1";

/** Responses requires at least 16 output tokens. */
const MIN_OUTPUT_TOKENS = 16;

interface ReasoningDetail {
  type: "reasoning.encrypted";
  id: string;
  data: string;
  format: typeof OPENAI_REASONING_FORMAT;
}

/** A `reasoning` output item → its replayable detail, or null without encrypted content. */
function reasoningDetail(item: Json): ReasoningDetail | null {
  if (item.type !== "reasoning" || typeof item.id !== "string" || typeof item.encrypted_content !== "string") {
    return null;
  }
  return { type: "reasoning.encrypted", id: item.id, data: item.encrypted_content, format: OPENAI_REASONING_FORMAT };
}

function reasoningItems(details: unknown): Json[] {
  if (!Array.isArray(details)) return [];
  const items: Json[] = [];
  for (const raw of details) {
    const detail = raw as Partial<ReasoningDetail> | null;
    if (detail?.format !== OPENAI_REASONING_FORMAT || typeof detail.id !== "string" ||
      typeof detail.data !== "string") continue;
    items.push({ type: "reasoning", id: detail.id, summary: [], encrypted_content: detail.data });
  }
  return items;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && (part as Json).type === "text"
      ? String((part as Json).text ?? "")
      : ""))
    .join("");
}

/** Chat content parts → Responses input parts (text, image, file). */
function inputParts(content: unknown): Json[] {
  if (typeof content === "string") return content ? [{ type: "input_text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts: Json[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as Json;
    if (part.type === "text" && typeof part.text === "string" && part.text) {
      parts.push({ type: "input_text", text: part.text });
    } else if (part.type === "image_url") {
      const url = (part.image_url as Json | undefined)?.url;
      if (typeof url === "string") parts.push({ type: "input_image", image_url: url, detail: "auto" });
    } else if (part.type === "file") {
      const file = (part.file as Json | undefined) ?? {};
      if (typeof file.file_data === "string") {
        parts.push({
          type: "input_file",
          file_data: file.file_data,
          filename: typeof file.filename === "string" ? file.filename : "file.pdf",
        });
      }
    }
  }
  return parts;
}

/**
 * Chat messages → Responses `input` items. An assistant turn becomes its
 * reasoning items, its text and its function calls, in that order; a tool
 * message becomes a `function_call_output`.
 */
export function toResponsesInput(messages: unknown[]): Json[] {
  const input: Json[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Json;
    const role = message.role;
    if (role === "system" || role === "developer") {
      const text = textOf(message.content);
      if (text) input.push({ type: "message", role, content: text });
    } else if (role === "user") {
      const content = inputParts(message.content);
      if (content.length > 0) input.push({ type: "message", role: "user", content });
    } else if (role === "assistant") {
      input.push(...reasoningItems(message.reasoning_details));
      const text = textOf(message.content);
      if (text) {
        input.push({
          type: "message", role: "assistant",
          content: [{ type: "output_text", text, annotations: [] }],
        });
      }
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls as Json[] : []) {
        const fn = (call?.function ?? {}) as Json;
        if (typeof call?.id !== "string" || typeof fn.name !== "string") continue;
        input.push({
          type: "function_call",
          call_id: call.id,
          name: fn.name,
          arguments: typeof fn.arguments === "string" && fn.arguments ? fn.arguments : "{}",
        });
      }
    } else if (role === "tool" && typeof message.tool_call_id === "string") {
      input.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: textOf(message.content) || "(empty)",
      });
    }
  }
  return input;
}

function toResponsesTools(tools: unknown): Json[] | undefined {
  if (!Array.isArray(tools)) return undefined;
  const out: Json[] = [];
  for (const raw of tools) {
    const fn = (raw as { function?: Json } | null)?.function;
    if (!fn || typeof fn.name !== "string") continue;
    out.push({
      type: "function",
      name: fn.name,
      ...(typeof fn.description === "string" ? { description: fn.description } : {}),
      parameters: fn.parameters && typeof fn.parameters === "object"
        ? fn.parameters
        : { type: "object", properties: {} },
      ...(typeof fn.strict === "boolean" ? { strict: fn.strict } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

function toResponsesToolChoice(choice: unknown): unknown {
  if (typeof choice === "string") return choice;
  if (!choice || typeof choice !== "object") return undefined;
  const value = choice as Json;
  const name = (value.function as Json | undefined)?.name;
  if (value.type === "function" && typeof name === "string") return { type: "function", name };
  const allowed = value.allowed_tools as Json | undefined;
  if (value.type === "allowed_tools" && allowed) {
    const tools = Array.isArray(allowed.tools)
      ? (allowed.tools as Json[]).map((tool) => {
          const toolName = (tool.function as Json | undefined)?.name ?? tool.name;
          return { type: "function", name: toolName };
        })
      : [];
    return { type: "allowed_tools", mode: allowed.mode === "required" ? "required" : "auto", tools };
  }
  return undefined;
}

function toResponsesTextFormat(format: unknown): Json | undefined {
  if (!format || typeof format !== "object") return undefined;
  const value = format as Json;
  if (value.type === "json_object") return { format: { type: "json_object" } };
  const schema = value.json_schema as Json | undefined;
  if (value.type !== "json_schema" || !schema || typeof schema.schema !== "object") return undefined;
  return {
    format: {
      type: "json_schema",
      name: typeof schema.name === "string" ? schema.name.slice(0, 64) : "output",
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
}

/**
 * The translated chat body → a Responses body. `reasoning_effort` becomes
 * `reasoning.effort`; the sampling temperature is kept only at effort `none`
 * (the reasoning guide requires removing it otherwise). Chat-only fields
 * (`stream_options`, `usage`) are dropped.
 */
export function toResponsesBody(body: Json): Json {
  const effort = typeof body.reasoning_effort === "string" ? body.reasoning_effort : undefined;
  const ceiling = body.max_completion_tokens ?? body.max_tokens;
  const tools = toResponsesTools(body.tools);
  const toolChoice = tools ? toResponsesToolChoice(body.tool_choice) : undefined;
  const text = toResponsesTextFormat(body.response_format);
  return {
    model: body.model,
    input: toResponsesInput(Array.isArray(body.messages) ? body.messages : []),
    store: false,
    include: ["reasoning.encrypted_content"],
    ...(body.stream === true ? { stream: true } : {}),
    ...(typeof ceiling === "number" ? { max_output_tokens: Math.max(MIN_OUTPUT_TOKENS, ceiling) } : {}),
    ...(effort ? { reasoning: { effort } } : {}),
    ...(tools ? { tools } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    ...(tools && typeof body.parallel_tool_calls === "boolean" ? { parallel_tool_calls: body.parallel_tool_calls } : {}),
    ...(typeof body.temperature === "number" && (effort === undefined || effort === "none")
      ? { temperature: body.temperature }
      : {}),
    ...(text ? { text } : {}),
  };
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

function toChatUsage(usage: ResponsesUsage | undefined) {
  const prompt = usage?.input_tokens ?? 0;
  const completion = usage?.output_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: usage?.input_tokens_details?.cached_tokens ?? 0 },
    completion_tokens_details: { reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens ?? 0 },
  };
}

/** A finished response → the chat `finish_reason`. */
export function toChatFinishReason(response: Json, sawToolCall: boolean): string {
  if (sawToolCall) return "tool_calls";
  if (response.status === "incomplete") {
    const reason = (response.incomplete_details as Json | null | undefined)?.reason;
    return reason === "content_filter" ? "content_filter" : "length";
  }
  return "stop";
}

/** A non-streaming Responses reply → a chat completion object. */
export function toChatCompletion(response: Json): Json {
  const output = Array.isArray(response.output) ? response.output as Json[] : [];
  const text = output
    .filter((item) => item.type === "message")
    .flatMap((item) => (Array.isArray(item.content) ? item.content as Json[] : []))
    .filter((part) => part.type === "output_text")
    .map((part) => String(part.text ?? ""))
    .join("");
  const reasoning = output
    .filter((item) => item.type === "reasoning")
    .flatMap((item) => (Array.isArray(item.summary) ? item.summary as Json[] : []))
    .map((part) => String(part.text ?? ""))
    .join("\n\n");
  const details = output.map(reasoningDetail).filter((detail): detail is ReasoningDetail => detail !== null);
  const toolCalls = output.filter((item) => item.type === "function_call").map((item) => ({
    id: item.call_id,
    type: "function",
    function: { name: item.name, arguments: typeof item.arguments === "string" ? item.arguments : "{}" },
  }));
  return {
    id: response.id,
    object: "chat.completion",
    model: response.model,
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: text || null,
        ...(reasoning ? { reasoning } : {}),
        ...(details.length > 0 ? { reasoning_details: details } : {}),
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toChatFinishReason(response, toolCalls.length > 0),
    }],
    usage: toChatUsage(response.usage as ResponsesUsage | undefined),
  };
}

/**
 * Responses event stream → chat completion chunks (`data: {...}` lines,
 * ending with `data: [DONE]`). Text deltas become `delta.content`, reasoning
 * summaries `delta.reasoning`, function calls indexed `tool_calls` deltas,
 * and each finished reasoning item a `reasoning_details` delta.
 */
export function toChatCompletionStream(source: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let id = "";
  let model = "";
  let sawToolCall = false;
  let lastSummary: string | null = null;
  const toolIndexByItem = new Map<string, number>();

  const chunk = (delta: Json) =>
    encoder.encode(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", model,
      choices: [{ index: 0, delta, finish_reason: null }],
    })}\n\n`);
  const finish = (response: Json, emit: (bytes: Uint8Array) => void) => {
    emit(encoder.encode(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", model,
      choices: [{ index: 0, delta: {}, finish_reason: toChatFinishReason(response, sawToolCall) }],
    })}\n\n`));
    emit(encoder.encode(`data: ${JSON.stringify({
      id, object: "chat.completion.chunk", model, choices: [],
      usage: toChatUsage(response.usage as ResponsesUsage | undefined),
    })}\n\ndata: [DONE]\n\n`));
  };
  const fail = (error: Json, emit: (bytes: Uint8Array) => void) => {
    emit(encoder.encode(`data: ${JSON.stringify({
      error: {
        message: String(error.message ?? "OpenAI stream error"),
        type: typeof error.type === "string" ? error.type : "api_error",
        code: typeof error.code === "string" ? error.code : null,
      },
    })}\n\n`));
  };

  const handle = (event: Json, emit: (bytes: Uint8Array) => void) => {
    switch (event.type) {
      case "response.created": {
        const response = (event.response ?? {}) as Json;
        id = String(response.id ?? "");
        model = String(response.model ?? "");
        emit(chunk({ role: "assistant" }));
        break;
      }
      case "response.output_item.added": {
        const item = (event.item ?? {}) as Json;
        if (item.type === "function_call" && typeof item.id === "string") {
          sawToolCall = true;
          const index = toolIndexByItem.size;
          toolIndexByItem.set(item.id, index);
          emit(chunk({
            tool_calls: [{
              index, id: item.call_id, type: "function",
              function: { name: item.name, arguments: "" },
            }],
          }));
        }
        break;
      }
      case "response.output_text.delta":
        if (typeof event.delta === "string" && event.delta) emit(chunk({ content: event.delta }));
        break;
      case "response.function_call_arguments.delta": {
        const index = typeof event.item_id === "string" ? toolIndexByItem.get(event.item_id) : undefined;
        if (index !== undefined && typeof event.delta === "string") {
          emit(chunk({ tool_calls: [{ index, function: { arguments: event.delta } }] }));
        }
        break;
      }
      case "response.reasoning_summary_text.delta": {
        if (typeof event.delta !== "string" || !event.delta) break;
        const part = `${String(event.item_id ?? "")}:${String(event.summary_index ?? 0)}`;
        const separator = lastSummary !== null && lastSummary !== part ? "\n\n" : "";
        lastSummary = part;
        emit(chunk({ reasoning: separator + event.delta }));
        break;
      }
      case "response.output_item.done": {
        // The final item carries the complete encrypted reasoning.
        const detail = reasoningDetail((event.item ?? {}) as Json);
        if (detail) emit(chunk({ reasoning_details: [detail] }));
        break;
      }
      case "response.completed":
      case "response.incomplete":
        finish((event.response ?? {}) as Json, emit);
        break;
      case "response.failed":
        fail(((event.response as Json | undefined)?.error ?? {}) as Json, emit);
        break;
      case "error":
        fail(event, emit);
        break;
      default:
        break;
    }
  };

  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    // Reads until it emits a chunk or the source ends, like the Anthropic
    // converter: a pull that enqueues nothing is not called again.
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
 * Wraps a Responses reply so it reads as a chat completions response. Errors
 * already use the OpenAI error shape and pass through with their status.
 */
export async function toChatCompletionsResponse(response: Response, stream: boolean): Promise<Response> {
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  if (stream && response.body) {
    headers.set("content-type", "text/event-stream");
    return new Response(toChatCompletionStream(response.body), {
      status: response.status, statusText: response.statusText, headers,
    });
  }
  headers.set("content-type", "application/json");
  const body = await response.json() as Json;
  return new Response(JSON.stringify(toChatCompletion(body)), {
    status: response.status, statusText: response.statusText, headers,
  });
}
