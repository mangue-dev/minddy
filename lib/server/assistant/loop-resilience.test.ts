import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const executeTool = vi.fn();
vi.mock("./execute-tool", () => ({
  executeTool: (...args: unknown[]) => executeTool(...args),
}));

const fetchOpenRouter = vi.fn();
vi.mock("@/lib/server/model-config", () => ({
  fetchOpenRouterWithSuffixFallback: (...args: unknown[]) => fetchOpenRouter(...args),
}));

const { processChat } = await import("./loop");

function stream(delta: Record<string, unknown>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ id: "generation", model: "model", choices: [{ delta }] })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function fakeService(): SupabaseClient {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: "message" } }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("Numo chat loop resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    executeTool.mockResolvedValue({ result: { ok: true }, success: true });
  });

  it("reserves a final text reply after twelve tool rounds", async () => {
    let round = 0;
    fetchOpenRouter.mockImplementation(async () => {
      round++;
      return {
        model: "model",
        response:
          round <= 12
            ? stream({
                tool_calls: [
                  {
                    index: 0,
                    id: `call-${round}`,
                    function: { name: "noop", arguments: "{}" },
                  },
                ],
              })
            : stream({ content: "Work completed." }),
      };
    });

    const service = fakeService();
    const result = await processChat(
      [{ role: "user", content: "Complete a complex task" }],
      [
        {
          type: "function",
          function: {
            name: "noop",
            description: "No-op test tool",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: service,
        service,
        locale: "en",
      },
    );

    expect(fetchOpenRouter).toHaveBeenCalledTimes(13);
    expect(executeTool).toHaveBeenCalledTimes(12);
    expect(result.fullContent).toBe("Work completed.");

    const requestBodies = fetchOpenRouter.mock.calls.map((call) => {
      const buildRequest = call[2] as (model: string) => RequestInit;
      return JSON.parse(buildRequest("model").body as string) as Record<string, unknown>;
    });
    expect(requestBodies.slice(0, 12).every((body) => Array.isArray(body.tools))).toBe(true);
    expect(requestBodies[12]).not.toHaveProperty("tools");
    expect(requestBodies[0]).toMatchObject({
      max_completion_tokens: 6144,
      reasoning: { effort: "medium", exclude: false },
    });
  });
});
