import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  toChatCompletion,
  toChatCompletionsResponse,
  toResponsesBody,
} = await import("./openai-responses");

function sse(events: unknown[]): string {
  return events.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join("");
}

function chunked(text: string, size: number): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

function chatChunks(raw: string) {
  return raw.split("\n").filter((line) => line.startsWith("data:") && !line.includes("[DONE]"))
    .map((line) => JSON.parse(line.slice(5)) as {
      choices: Array<{ delta: Record<string, unknown>; finish_reason: string | null }>;
      usage?: Record<string, unknown>;
      error?: { message: string };
    });
}

const reasoningItem = { type: "reasoning.encrypted", id: "rs_1", data: "enc", format: "openai-responses-v1" };

/**
 * The Responses transport (MIN-979): GPT-6 Astra and GPT-6.1 call tools only
 * on `/v1/responses`, and the GPT-5.6 / GPT-6 Sol families reason with tools
 * only there. Callers keep building and reading the chat shape.
 */
describe("toResponsesBody", () => {
  it("converts a tool round with its reasoning items and keeps the request stateless", () => {
    const body = toResponsesBody({
      model: "gpt-6-astra",
      messages: [
        { role: "system", content: "You are Numo." },
        { role: "user", content: [{ type: "text", text: "List" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] },
        {
          role: "assistant", content: "Looking.", reasoning_details: [reasoningItem],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "list", arguments: "{\"q\":1}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "[]" },
      ],
      tools: [{ type: "function", function: { name: "list", description: "d", parameters: { type: "object" } } }],
      tool_choice: { type: "function", function: { name: "list" } },
      parallel_tool_calls: false,
      reasoning_effort: "high",
      max_completion_tokens: 8,
      temperature: 0,
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(body).toMatchObject({
      model: "gpt-6-astra", store: false, stream: true, include: ["reasoning.encrypted_content"],
      reasoning: { effort: "high" }, max_output_tokens: 16, parallel_tool_calls: false,
      tools: [{ type: "function", name: "list", description: "d", parameters: { type: "object" } }],
      tool_choice: { type: "function", name: "list" },
    });
    // Reasoning is on: the sampling temperature must go.
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("stream_options");
    expect((body.input as Array<Record<string, unknown>>).map((item) => item.type ?? item.role)).toEqual([
      "message", "message", "reasoning", "message", "function_call", "function_call_output",
    ]);
    const input = body.input as Array<Record<string, unknown>>;
    expect(input[1]!.content).toEqual([
      { type: "input_text", text: "List" },
      { type: "input_image", image_url: "data:image/png;base64,AA", detail: "auto" },
    ]);
    expect(input[2]).toEqual({ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc" });
    expect(input[4]).toEqual({ type: "function_call", call_id: "call_1", name: "list", arguments: "{\"q\":1}" });
    expect(input[5]).toEqual({ type: "function_call_output", call_id: "call_1", output: "[]" });
  });

  it("converts structured output and keeps temperature at effort none", () => {
    const body = toResponsesBody({
      model: "gpt-6-sol", messages: [], reasoning_effort: "none", temperature: 0.2,
      response_format: { type: "json_schema", json_schema: { name: "fill", schema: { type: "object" }, strict: true } },
    });
    expect(body).toMatchObject({
      temperature: 0.2,
      text: { format: { type: "json_schema", name: "fill", schema: { type: "object" }, strict: true } },
    });
  });
});

describe("Responses replies as chat completions", () => {
  it("converts a JSON reply with a function call, reasoning and usage", () => {
    const completion = toChatCompletion({
      id: "resp_1", model: "gpt-6-astra", status: "completed",
      output: [
        { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Plan." }], encrypted_content: "enc" },
        { type: "function_call", id: "fc_1", call_id: "call_1", name: "fill", arguments: "{}" },
      ],
      usage: { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 4 } },
    }) as { choices: Array<{ message: Record<string, unknown>; finish_reason: string }>; usage: Record<string, unknown> };
    expect(completion.choices[0]).toMatchObject({
      finish_reason: "tool_calls",
      message: {
        content: null, reasoning: "Plan.", reasoning_details: [reasoningItem],
        tool_calls: [{ id: "call_1", type: "function", function: { name: "fill", arguments: "{}" } }],
      },
    });
    expect(completion.usage).toMatchObject({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  });

  it("reads an incomplete reply as a length stop", () => {
    const completion = toChatCompletion({
      status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [],
    }) as { choices: Array<{ finish_reason: string }> };
    expect(completion.choices[0]!.finish_reason).toBe("length");
  });

  it("streams text, summaries, function calls, reasoning items and usage", async () => {
    const events = sse([
      { type: "response.created", response: { id: "resp_1", model: "gpt-6-astra" } },
      { type: "response.reasoning_summary_text.delta", item_id: "rs_1", summary_index: 0, delta: "Plan" },
      { type: "response.output_item.done", output_index: 0, item: { type: "reasoning", id: "rs_1", encrypted_content: "enc" } },
      { type: "response.output_text.delta", item_id: "msg_1", delta: "Looking" },
      { type: "response.output_item.added", output_index: 2, item: { type: "function_call", id: "fc_1", call_id: "call_1", name: "list", arguments: "" } },
      { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "{\"q\":" },
      { type: "response.function_call_arguments.delta", item_id: "fc_1", delta: "1}" },
      { type: "response.completed", response: { status: "completed", usage: { input_tokens: 7, output_tokens: 3 } } },
    ]);
    const response = await toChatCompletionsResponse(
      new Response(chunked(events, 9), { status: 200, headers: { "content-type": "text/event-stream" } }),
      true,
    );
    const raw = await response.text();
    expect(raw.trimEnd().endsWith("data: [DONE]")).toBe(true);
    const chunks = chatChunks(raw);
    const deltas = chunks.flatMap((chunk) => chunk.choices.map((choice) => choice.delta));
    expect(deltas.map((delta) => delta.reasoning ?? "").join("")).toBe("Plan");
    expect(deltas.map((delta) => delta.content ?? "").join("")).toBe("Looking");
    expect(deltas.flatMap((delta) => (delta.reasoning_details as unknown[] | undefined) ?? []))
      .toEqual([reasoningItem]);
    const tools = deltas.flatMap((delta) => (delta.tool_calls as Array<Record<string, unknown>> | undefined) ?? []);
    expect(tools[0]).toMatchObject({ index: 0, id: "call_1", function: { name: "list", arguments: "" } });
    expect(tools.slice(1).map((tool) => (tool.function as { arguments: string }).arguments).join("")).toBe("{\"q\":1}");
    expect(chunks.flatMap((chunk) => chunk.choices.map((choice) => choice.finish_reason))).toContain("tool_calls");
    expect(chunks.at(-1)?.usage).toMatchObject({ prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 });
  });

  it("reports a failed response in the chat error shape", async () => {
    const response = await toChatCompletionsResponse(new Response(sse([
      { type: "response.created", response: { id: "r", model: "m" } },
      { type: "response.failed", response: { status: "failed", error: { code: "server_error", message: "Boom" } } },
    ])), true);
    expect(chatChunks(await response.text()).at(-1)?.error?.message).toBe("Boom");
  });

  it("passes an HTTP error through unchanged", async () => {
    const error = new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400 });
    expect(await toChatCompletionsResponse(error, true)).toBe(error);
  });
});
