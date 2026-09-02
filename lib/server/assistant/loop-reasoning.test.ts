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
    expect(events.map((event) => event.type)).toEqual([
      "reasoning_start",
      "reasoning_end",
      "content_delta",
    ]);
    expect(events.find((event) => event.type === "reasoning_end")?.data.text).toBe(
      "Check the context.",
    );
  });
});
