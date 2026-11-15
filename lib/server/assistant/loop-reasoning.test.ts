import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

vi.mock("./execute-tool", () => ({
  executeTool: vi.fn(),
}));

const fetchOpenRouter = vi.fn();
vi.mock("@/lib/server/model-config", () => ({
  fetchOpenRouterWithSuffixFallback: (...args: unknown[]) => fetchOpenRouter(...args),
}));

const { processChat } = await import("./loop");

function responseWith(deltas: Record<string, unknown>[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const delta of deltas) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              id: "generation",
              model: "model",
              choices: [{ delta }],
            })}\n\n`,
          ),
        );
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("Numo chat reasoning stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("forwards real reasoning deltas before content and returns the durable trace", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: responseWith([
        { reasoning: "Check " },
        { reasoning: "the context." },
        { content: "Done." },
      ]),
    });
    const events: Array<{ type: string; data: Record<string, unknown> }> = [];
    const service = {} as SupabaseClient;

    const result = await processChat(
      [{ role: "user", content: "Help me" }],
      [],
      {
        emit: (type: string, data: Record<string, unknown>) =>
          events.push({ type, data }),
      } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: null,
        userId: "user",
        supabase: service,
        service,
        locale: "en",
      },
    );

    expect(result.fullContent).toBe("Done.");
    expect(result.finalReasoning).toMatchObject({ text: "Check the context." });
    expect(events.filter((event) => event.type !== "reasoning_delta").map(
      (event) => event.type,
    )).toEqual([
      "reasoning_start",
      "reasoning_end",
      "content_delta",
    ]);
    // The live trace streams before content arrives, as snapshots of the
    // accumulated text.
    expect(events.filter((event) => event.type === "reasoning_delta").map(
      (event) => event.data.text,
    )).toEqual(["Check ", "Check the context."]);
    expect(events.find((event) => event.type === "reasoning_end")?.data.text).toBe(
      "Check the context.",
    );
  });
});

describe("Numo generation usage (MIN-1001)", () => {
  it("carries the provider's cached tokens to the generation the ledger records", async () => {
    const encoder = new TextEncoder();
    const chunks = [
      { id: "generation", model: "model", choices: [{ delta: { content: "Done." } }] },
      {
        id: "generation", model: "model", choices: [],
        usage: {
          prompt_tokens: 100, completion_tokens: 5, total_tokens: 105,
          prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 15 },
        },
      },
    ];
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }), { status: 200 }),
    });
    const service = {} as SupabaseClient;
    const result = await processChat([{ role: "user", content: "Help me" }], [], { emit: () => {} } as never, {
      model: "model", conversationId: "conversation", projectId: null, userId: "user",
      supabase: service, service, locale: "en",
    });
    expect(result.generations[0]).toMatchObject({ promptTokens: 100, cachedTokens: 80, cacheWriteTokens: 15 });
  });
});
