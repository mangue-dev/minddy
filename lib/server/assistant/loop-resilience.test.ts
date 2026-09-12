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

const { processChat, toolReplayPolicy } = await import("./loop");

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

  it("suspends durably when a code worker is launched", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream({
        tool_calls: [{
          index: 0,
          id: "call-worker",
          function: { name: "launch_code_agent", arguments: "{}" },
        }],
      }),
    });
    executeTool.mockResolvedValue({
      result: { launched: true, run_id: "worker-run" },
      success: true,
    });

    const service = fakeService();
    const registerActiveRun = vi.fn();
    const result = await processChat(
      [{ role: "user", content: "Implement the issue" }],
      [],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: service,
        service,
        locale: "en",
        registerActiveRun,
      },
    );

    expect(fetchOpenRouter).toHaveBeenCalledOnce();
    expect(result.suspension).toEqual({ kind: "work", runId: "worker-run" });
    expect(registerActiveRun).toHaveBeenCalledWith("worker-run");
  });

  it("surfaces an ambiguous mutation instead of executing it again", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream({
        tool_calls: [{
          index: 0,
          id: "call-create",
          function: { name: "create_issue", arguments: '{"title":"Only once"}' },
        }],
      }),
    });
    const service = fakeService();

    await expect(processChat(
      [{ role: "user", content: "Create it" }],
      [],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: service,
        service,
        locale: "en",
        toolLedger: {
          claim: async () => ({ action: "reconcile" }),
          complete: async () => {},
        },
      },
    )).rejects.toThrow("may have completed");
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("preserves a completed tool's suspension when its durable result is reused", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream({
        tool_calls: [{
          index: 0,
          id: "call-proposal",
          function: { name: "propose_backlog", arguments: "{}" },
        }],
      }),
    });
    const service = fakeService();
    const complete = vi.fn();

    await processChat(
      [{ role: "user", content: "Propose a backlog" }],
      [],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: service,
        service,
        locale: "en",
        toolLedger: {
          claim: async () => ({
            action: "reuse",
            execution: { result: { proposed: true }, success: true, pause: true },
          }),
          complete,
        },
      },
    );

    expect(fetchOpenRouter).toHaveBeenCalledOnce();
    expect(executeTool).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("checkpoints an ask_user result before suspending for input", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream({
        tool_calls: [{
          index: 0,
          id: "call-question",
          function: {
            name: "ask_user",
            arguments: JSON.stringify({
              questions: [{ header: "Scope", question: "Which scope should be used?" }],
            }),
          },
        }],
      }),
    });
    const persistCheckpoint = vi.fn();

    const result = await processChat(
      [{ role: "user", content: "Help me decide" }],
      [],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: fakeService(),
        service: fakeService(),
        locale: "en",
        persistCheckpoint,
      },
    );

    expect(result.suspension).toEqual({ kind: "input" });
    expect(persistCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: "tools",
      completedToolCallIds: ["call-question"],
    }));
  });

  it("commits a durable tool round before executing its tools", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream({
        tool_calls: [{
          index: 0,
          id: "call-create",
          function: { name: "create_issue", arguments: '{"title":"Durable"}' },
        }],
      }),
    });
    executeTool.mockResolvedValue({ result: { id: "issue" }, success: true, pause: true });
    const persistToolRound = vi.fn().mockResolvedValue("assistant-round");

    await processChat(
      [{ role: "user", content: "Create it" }],
      [],
      { emit: vi.fn() } as never,
      {
        model: "model",
        conversationId: "conversation",
        projectId: "project",
        userId: "user",
        supabase: fakeService(),
        service: fakeService(),
        locale: "en",
        turnId: "turn",
        persistToolRound,
        persistCheckpoint: vi.fn(),
      },
    );

    expect(persistToolRound).toHaveBeenCalledWith(expect.objectContaining({
      pendingToolCalls: [expect.objectContaining({ id: "call-create" })],
      roundCount: 1,
    }));
    expect(persistToolRound.mock.invocationCallOrder[0])
      .toBeLessThan(executeTool.mock.invocationCallOrder[0]);
  });

  it("retries read-only tools and reconciles mutations", () => {
    expect(toolReplayPolicy("web_search")).toBe("retry");
    expect(toolReplayPolicy("propose_backlog")).toBe("retry");
    expect(toolReplayPolicy("get_issue")).toBe("retry");
    expect(toolReplayPolicy("launch_code_agent")).toBe("retry");
    expect(toolReplayPolicy("create_issue")).toBe("reconcile");
  });
});
