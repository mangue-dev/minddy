import { describe, expect, it } from "vitest";

import {
  toAnthropicMessagesBody,
  toChatCompletion,
  toChatCompletionsResponse,
  toChatErrorBody,
} from "./anthropic-messages";

function sse(events: unknown[]): string {
  return events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

/** A body split into arbitrary network chunks, to exercise partial lines. */
function chunked(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

function chatChunks(raw: string) {
  return raw.split("\n").filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice(5)) as {
      choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>;
      usage?: Record<string, number>;
      error?: { message: string };
    });
}

describe("toAnthropicMessagesBody", () => {
  it("hoists system prompts and converts tool rounds", () => {
    const body = toAnthropicMessagesBody({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      stream: true,
      messages: [
        { role: "system", content: "You are Numo." },
        { role: "user", content: "List my issues" },
        {
          role: "assistant",
          content: "Looking.",
          tool_calls: [{ id: "t1", type: "function", function: { name: "list", arguments: "{\"q\":\"x\"}" } }],
        },
        { role: "tool", tool_call_id: "t1", content: "MIN-1" },
        { role: "system", content: "Answer briefly." },
        { role: "user", content: "Thanks" },
      ],
      tools: [{ type: "function", function: { name: "list", description: "List", parameters: { type: "object" } } }],
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      stream_options: { include_usage: true },
    });
    expect(body).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      stream: true,
      system: "You are Numo.\n\nAnswer briefly.",
      tools: [{ name: "list", description: "List", input_schema: { type: "object" } }],
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      cache_control: { type: "ephemeral" },
    });
    expect(body.messages).toEqual([
      { role: "user", content: [{ type: "text", text: "List my issues" }] },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Looking." },
          { type: "tool_use", id: "t1", name: "list", input: { q: "x" } },
        ],
      },
      // The tool result and the next user message share one user turn.
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "MIN-1" }] },
          { type: "text", text: "Thanks" },
        ],
      },
    ]);
    expect(body).not.toHaveProperty("stream_options");
  });

  it("converts images, PDFs, tool choice, stop and structured output", () => {
    const body = toAnthropicMessagesBody({
      model: "claude-sonnet-5",
      max_completion_tokens: 500,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "Read these" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
          { type: "image_url", image_url: { url: "https://example.com/a.png" } },
          { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,BBB" } },
        ],
      }],
      tools: [{ type: "function", function: { name: "fill", parameters: { type: "object" } } }],
      tool_choice: { type: "function", function: { name: "fill" } },
      parallel_tool_calls: false,
      stop: "END",
      response_format: { type: "json_schema", json_schema: { name: "x", schema: { type: "object" } } },
    });
    expect((body.messages as Array<{ content: unknown[] }>)[0]!.content).toEqual([
      { type: "text", text: "Read these" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
      { type: "image", source: { type: "url", url: "https://example.com/a.png" } },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "BBB" } },
    ]);
    expect(body).toMatchObject({
      max_tokens: 500,
      tool_choice: { type: "tool", name: "fill", disable_parallel_tool_use: true },
      stop_sequences: ["END"],
      output_config: { format: { type: "json_schema", schema: { type: "object" } } },
    });
    expect(toAnthropicMessagesBody({ model: "m", messages: [], tools: [{ type: "function", function: { name: "a" } }], tool_choice: "required" }))
      .toMatchObject({ tool_choice: { type: "any" } });
  });
});

describe("toChatCompletionsResponse", () => {
  it("streams text, reasoning, tool calls, finish reason and usage as chat chunks", async () => {
    const events = sse([
      { type: "message_start", message: { id: "msg_1", model: "claude-opus-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 5 } } },
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me check." } },
      { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig" } },
      { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Looking" } },
      { type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "list", input: {} } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "{\"q\":" } },
      { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: "\"x\"}" } },
      { type: "ping" },
      { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 20 } },
      { type: "message_stop" },
    ]);
    // 7-byte chunks split every event mid-line: the converter must keep
    // reading until a full event arrives instead of stalling.
    const response = await toChatCompletionsResponse(
      new Response(chunked(events, 7), { status: 200, headers: { "content-type": "text/event-stream" } }),
      true,
    );
    const raw = await response.text();
    expect(raw.trimEnd().endsWith("data: [DONE]")).toBe(true);
    const chunks = chatChunks(raw);
    const deltas = chunks.flatMap((chunk) => chunk.choices.map((choice) => choice.delta));
    expect(deltas.map((delta) => delta.reasoning).join("")).toBe("Let me check.");
    expect(deltas.map((delta) => delta.content ?? "").join("")).toBe("Looking");
    const toolDeltas = deltas.flatMap((delta) => (delta.tool_calls as Array<Record<string, unknown>> | undefined) ?? []);
    expect(toolDeltas[0]).toMatchObject({ index: 0, id: "toolu_1", function: { name: "list", arguments: "" } });
    expect(toolDeltas.slice(1).map((delta) => (delta.function as { arguments: string }).arguments).join(""))
      .toBe("{\"q\":\"x\"}");
    expect(chunks.flatMap((chunk) => chunk.choices.map((choice) => choice.finish_reason)))
      .toContain("tool_calls");
    expect(chunks.at(-1)?.usage).toEqual({ prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 });
  });

  it("reports an in-stream error in the chat error shape", async () => {
    const response = await toChatCompletionsResponse(new Response(sse([
      { type: "message_start", message: { id: "m", model: "c" } },
      { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
    ])), true);
    const errors = chatChunks(await response.text()).filter((chunk) => chunk.error);
    expect(errors[0]?.error).toMatchObject({ message: "Overloaded" });
  });

  it("converts a JSON reply and keeps an error's status", async () => {
    const ok = await toChatCompletionsResponse(new Response(JSON.stringify({
      id: "msg", model: "claude-sonnet-5", stop_reason: "max_tokens",
      content: [{ type: "thinking", thinking: "hm" }, { type: "text", text: "Hi" }],
      usage: { input_tokens: 3, output_tokens: 4 },
    })), false);
    expect(await ok.json()).toMatchObject({
      choices: [{ message: { content: "Hi", reasoning: "hm" }, finish_reason: "length" }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    });
    const failed = await toChatCompletionsResponse(new Response(JSON.stringify({
      type: "error", error: { type: "invalid_request_error", message: "bad effort" },
    }), { status: 400 }), true);
    expect(failed.status).toBe(400);
    expect(await failed.json()).toEqual({
      error: { message: "bad effort", type: "invalid_request_error", code: "invalid_request_error" },
    });
  });

  it("maps tool uses of a JSON reply to chat tool calls", () => {
    expect(toChatCompletion({
      id: "m", model: "c", stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t", name: "fill", input: { a: 1 } }],
    })).toMatchObject({
      choices: [{
        message: { content: null, tool_calls: [{ id: "t", type: "function", function: { name: "fill", arguments: "{\"a\":1}" } }] },
        finish_reason: "tool_calls",
      }],
    });
    expect(toChatErrorBody("plain text")).toBe("plain text");
  });
});
