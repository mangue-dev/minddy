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
type ChatContext = Parameters<typeof processChat>[3];

function stream(delta: Record<string, unknown>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ id: "generation", model: "model", choices: [{ delta }] })}\n\n`,
      ));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function fakeService(): SupabaseClient {
  return {
    from: (table: string) => table === "numo_tool_content_scope" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    } : ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "message" } }) }) }),
    }),
  } as unknown as SupabaseClient;
}

const toolCalls = (...ids: string[]) => ({
  tool_calls: ids.map((id, index) => ({ index, id, function: { name: "noop", arguments: "{}" } })),
});

/** A durable turn's context, as `executeNumoTurn` wires it. */
function durableContext(overrides: Partial<ChatContext>): ChatContext {
  const service = fakeService();
  return {
    model: "model",
    conversationId: "conversation",
    projectId: "project",
    userId: "user",
    supabase: service,
    service,
    locale: "en",
    turnId: "turn",
    persistCheckpoint: vi.fn(),
    persistToolRound: vi.fn().mockResolvedValue("assistant-round"),
    toolLedger: {
      claim: async () => ({ action: "execute" as const }),
      complete: vi.fn(),
    },
    ...overrides,
  } as ChatContext;
}

describe("Numo loop handoff at the job deadline (MIN-1010)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = "test-key";
    executeTool.mockResolvedValue({ result: { ok: true }, success: true });
  });

  it("hands off between two rounds, after the round's tools are recorded", async () => {
    fetchOpenRouter.mockResolvedValue({ model: "model", response: stream(toolCalls("call-a")) });
    const persistCheckpoint = vi.fn();
    const shouldHandOff = vi.fn((step: "generation" | "tool") => step === "generation");

    const result = await processChat([{ role: "user", content: "Analyse the week" }], [],
      { emit: vi.fn() } as never, durableContext({ persistCheckpoint, shouldHandOff }));

    expect(result.suspension).toEqual({ kind: "handoff" });
    expect(result.fullContent).toBe("");
    expect(fetchOpenRouter).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledTimes(1);
    // The next job opens round 2 from this boundary.
    expect(persistCheckpoint.mock.calls.at(-1)?.[0]).toEqual({
      phase: "model", roundCount: 1, completionRepairs: 0,
    });
  });

  it("hands off in the middle of a tool series without starting the next tool", async () => {
    fetchOpenRouter.mockResolvedValue({
      model: "model",
      response: stream(toolCalls("call-a", "call-b", "call-c")),
    });
    const persistCheckpoint = vi.fn();
    const claim = vi.fn(async () => ({ action: "execute" as const }));
    const shouldHandOff = vi.fn(() => executeTool.mock.calls.length >= 1);

    const result = await processChat([{ role: "user", content: "Run three tools" }], [],
      { emit: vi.fn() } as never, durableContext({
        persistCheckpoint, shouldHandOff, toolLedger: { claim, complete: vi.fn() },
      }));

    expect(result.suspension).toEqual({ kind: "handoff" });
    expect(executeTool).toHaveBeenCalledTimes(1);
    // call-b was never claimed in the ledger, so it cannot become ambiguous.
    expect(claim).toHaveBeenCalledTimes(1);
    expect(fetchOpenRouter).toHaveBeenCalledTimes(1);
    expect(persistCheckpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: "tools",
      assistantMessageId: "assistant-round",
      completedToolCallIds: ["call-a"],
      roundCount: 1,
    });
    expect(shouldHandOff).toHaveBeenLastCalledWith("tool");
  });

  it("resumes the series in the next job and always runs one step before handing off again", async () => {
    // Even a job with no time left makes progress: call-b runs, call-c waits.
    const shouldHandOff = vi.fn(() => true);
    const persistCheckpoint = vi.fn();
    const calls = ["call-a", "call-b", "call-c"].map((id) => ({
      id, type: "function" as const, function: { name: "noop", arguments: "{}" },
    }));
    const claim = vi.fn(async ({ toolCallId }: { toolCallId: string }) => toolCallId === "call-a"
      ? { action: "reuse" as const, execution: { result: { ok: true }, success: true } }
      : { action: "execute" as const });

    const result = await processChat([{ role: "user", content: "Run three tools" }], [],
      { emit: vi.fn() } as never, durableContext({
        shouldHandOff,
        persistCheckpoint,
        toolLedger: { claim, complete: vi.fn() },
        resumeCheckpoint: {
          phase: "tools",
          assistantMessageId: "assistant-round",
          pendingToolCalls: calls,
          completedToolCallIds: ["call-a"],
          roundCount: 4,
        },
      }));

    expect(result.suspension).toEqual({ kind: "handoff" });
    expect(fetchOpenRouter).not.toHaveBeenCalled();
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(claim.mock.calls.map(([input]) => input.toolCallId)).toEqual(["call-a", "call-b"]);
    expect(persistCheckpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: "tools", completedToolCallIds: ["call-a", "call-b"], roundCount: 4,
    });
  });

  it("hands off before the first tool of a fresh round, on the round's own checkpoint", async () => {
    fetchOpenRouter.mockResolvedValue({ model: "model", response: stream(toolCalls("call-a")) });
    const persistCheckpoint = vi.fn();
    const persistToolRound = vi.fn().mockResolvedValue("assistant-round");

    const result = await processChat([{ role: "user", content: "Run a tool" }], [],
      { emit: vi.fn() } as never, durableContext({
        persistCheckpoint, persistToolRound, shouldHandOff: (step) => step === "tool",
      }));

    expect(result.suspension).toEqual({ kind: "handoff" });
    // The tool round checkpoint (no tool done yet) is all the next job needs.
    expect(persistToolRound).toHaveBeenCalledTimes(1);
    expect(persistCheckpoint).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it("hands off before a correction round, which the next job asks for again", async () => {
    fetchOpenRouter.mockResolvedValue({ model: "model", response: stream({ content: "" }) });
    const persistCheckpoint = vi.fn();

    const result = await processChat([{ role: "user", content: "Answer" }], [],
      { emit: vi.fn() } as never, durableContext({
        persistCheckpoint, shouldHandOff: (step) => step === "generation",
      }));

    expect(result.suspension).toEqual({ kind: "handoff" });
    expect(fetchOpenRouter).toHaveBeenCalledTimes(1);
    expect(persistCheckpoint.mock.calls.at(-1)?.[0]).toMatchObject({
      phase: "model", roundCount: 1, completionRepairs: 1, completionRepairPending: true,
    });
  });

  it("opens the first generation of a job even when the deadline is already short", async () => {
    fetchOpenRouter.mockResolvedValue({ model: "model", response: stream({ content: "Done." }) });

    const result = await processChat([{ role: "user", content: "Answer" }], [],
      { emit: vi.fn() } as never, durableContext({ shouldHandOff: () => true }));

    expect(result.suspension).toBeNull();
    expect(result.fullContent).toBe("Done.");
  });
});
