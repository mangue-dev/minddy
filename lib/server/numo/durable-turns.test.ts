import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  turn: null as Record<string, unknown> | null,
  events: [] as Array<Record<string, unknown>>,
  checkpoints: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  queuedTurns: [] as Array<Record<string, unknown>>,
  failActivity: false,
  processChat: vi.fn(),
}));

function queryFor(table: string) {
  let inserted: Record<string, unknown> | null = null;
  const query = {
    select: () => query,
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      if (table === "assistant_messages") h.messages.push(row);
      return query;
    },
    eq: () => query,
    is: () => query,
    in: () => query,
    lte: () => query,
    contains: () => query,
    gt: () => query,
    order: () => query,
    limit: () => query,
    single: async () => ({
      data: inserted ? { ...inserted, id: "saved-message" } : h.turn,
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: table === "assistant_messages"
        ? h.messages
        : table === "numo_assistant_turns"
          ? h.queuedTurns
          : [],
      error: null,
    }).then(resolve),
  };
  return query;
}

const service = {
  from: (table: string) => queryFor(table),
  rpc: async (name: string, args: Record<string, unknown> = {}) => {
    if (name === "claim_numo_turn") {
      h.turn = {
        ...h.turn,
        status: "running",
        claim_token: args.p_claim_token,
        attempts: Number(h.turn?.attempts ?? 0) + 1,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "checkpoint_numo_turn") {
      h.checkpoints.push(args);
      h.turn = {
        ...h.turn,
        status: args.p_status,
        checkpoint: args.p_checkpoint,
        active_run_id: args.p_active_run_id,
        error_message: args.p_error_message,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "append_numo_turn_event") {
      if (h.failActivity) return { data: null, error: { message: "journal unavailable" } };
      h.events.push(args);
      return { data: {}, error: null };
    }
    if (name === "recover_stale_numo_turns") return { data: 0, error: null };
    return { data: true, error: null };
  },
} as unknown as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/assistant/loop", () => ({
  AmbiguousToolExecutionError: class extends Error {},
  getModelInputModalities: async () => new Set(["text"]),
  modelSupportsCaching: async () => false,
  processChat: (...args: unknown[]) => h.processChat(...args),
}));
vi.mock("@/lib/server/assistant/prompt", () => ({
  buildClockBlock: () => "",
  buildGlobalSystemPrompt: () => "System",
  buildPageContextBlock: () => "Context",
  buildSystemPrompt: () => "Project system",
}));
vi.mock("@/lib/server/assistant/prompt-context", () => ({
  gatherProjectPromptContext: vi.fn(),
}));
vi.mock("@/lib/server/assistant/skills", () => ({
  authorizedSkillsNotes: async (_client: unknown, metadata: unknown[]) => metadata.map(() => ""),
}));
vi.mock("@/lib/server/assistant/attachment-parts", () => ({ buildAttachmentParts: async () => [] }));
vi.mock("@/lib/server/assistant/tools", () => ({ CONVERSATION_ASSISTANT_TOOLS: [{ function: { name: "get_issue" } }] }));
vi.mock("@/lib/server/web-search", () => ({ withoutWebSearch: (tools: unknown) => tools }));
vi.mock("@/lib/server/assistant/commands", () => ({ commandNote: () => "" }));
vi.mock("@/lib/server/assistant/sanitize", () => ({ sanitizeAssistantMessageContent: (value: unknown) => String(value ?? "") }));
vi.mock("@/lib/server/ai-usage", () => ({ recordAiUsage: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: vi.fn() }));

const { createDurableNumoEmitter, drainNumoTurns, executeNumoTurn } = await import("./turns");

const runtime = {
  apiKey: "key",
  mode: "platform" as const,
  provider: "generic" as const,
  baseUrl: "http://localhost",
  model: "model",
  requestProfile: {
    usageAccounting: false,
    streamUsage: false,
    outputTokenField: "max_tokens" as const,
    defaultMaxOutputTokens: 4096,
    attribution: false,
    promptCaching: false,
  },
};

function turn(checkpoint: Record<string, unknown> = {}) {
  return {
    id: "51600000-0000-4000-8000-000000000001",
    conversation_id: "51600000-0000-4000-8000-000000000002",
    user_id: "51600000-0000-4000-8000-000000000003",
    request_id: "51600000-0000-4000-8000-000000000004",
    run_id: "51600000-0000-4000-8000-000000000005",
    status: "queued",
    intent: {
      projectId: null,
      locale: "en",
      timezone: "UTC",
      numoDefaultStatus: "triage",
      webSearchEnabled: false,
    },
    checkpoint,
    model: "model",
    reasoning_level: "medium",
    active_run_id: null,
    attempts: 0,
    cost_usd: 0,
  };
}

beforeEach(() => {
  h.turn = turn();
  h.events.length = 0;
  h.checkpoints.length = 0;
  h.messages.length = 0;
  h.queuedTurns.length = 0;
  h.failActivity = false;
  h.messages.push({
    id: "user-message",
    turn_id: h.turn.id,
    role: "user",
    content: "Explain the project",
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {},
    context: null,
  });
  h.processChat.mockReset();
  h.processChat.mockResolvedValue({
    fullContent: "Done without code.",
    finalReasoning: null,
    allToolCalls: [],
    generations: [],
    suspension: null,
  });
});

describe("durable Numo execution", () => {
  it("finishes a dialogue turn without allocating a code worker", async () => {
    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.processChat).toHaveBeenCalledOnce();
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "completed",
      p_active_run_id: null,
    });
    expect(h.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: "Done without code.",
    }));
  });

  it("resumes a worker event in the background with code tools disabled", async () => {
    h.turn = turn({
      phase: "worker_result",
      worker_event: { type: "worker_completed", payload: { outcome: "Tests pass" } },
    });
    await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(h.processChat.mock.calls[0][1]).toEqual([]);
    expect(JSON.stringify(h.processChat.mock.calls[0][0])).toContain("worker_completed");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
  });

  it("moves interrupted initial work to retryable instead of leaving it running", async () => {
    h.turn = turn({ phase: "model" });
    const result = await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(result.status).toBe("retryable");
    expect(h.processChat).not.toHaveBeenCalled();
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "retryable" });
  });

  it("recovers a queued turn whose request died before dispatch", async () => {
    h.queuedTurns.push({ id: h.turn!.id, checkpoint: {} });

    await expect(drainNumoTurns({ limit: 1 })).resolves.toEqual({ claimed: 1 });
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "retryable" });
  });

  it("preserves the latest tool checkpoint when execution fails", async () => {
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as {
        persistCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
      };
      await context.persistCheckpoint({ phase: "tools", completedToolCallIds: ["call-1"] });
      throw new Error("provider disconnected");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("retryable");
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "retryable",
      p_checkpoint: { phase: "tools", completedToolCallIds: ["call-1"] },
    });
  });

  it("keeps prior tool rounds while reconstructing only the pending batch", async () => {
    h.turn = turn({
      phase: "tools",
      assistantMessageId: "assistant-pending",
      pendingToolCalls: [{
        id: "call-pending",
        type: "function",
        function: { name: "get_issue", arguments: "{}" },
      }],
      completedToolCallIds: [],
      roundCount: 2,
    });
    h.messages.length = 0;
    h.messages.push(
      {
        id: "user-message",
        turn_id: h.turn.id,
        role: "user",
        content: "Inspect both rounds",
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "assistant-prior",
        turn_id: h.turn.id,
        role: "assistant",
        content: "Prior narration",
        tool_calls: [{
          id: "call-prior",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "tool-prior",
        turn_id: h.turn.id,
        role: "tool",
        content: "Prior result",
        tool_calls: null,
        tool_call_id: "call-prior",
        tool_name: "get_issue",
        metadata: {},
        context: null,
      },
      {
        id: "assistant-pending",
        turn_id: h.turn.id,
        role: "assistant",
        content: "Pending narration",
        tool_calls: [{
          id: "call-pending",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
    );

    await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = JSON.stringify(h.processChat.mock.calls[0][0]);
    expect(executionMessages).toContain("Prior narration");
    expect(executionMessages).toContain("Prior result");
    expect(executionMessages).not.toContain("Pending narration");
  });

  it("journals replayable activity but never persists a live-only tool secret", async () => {
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string, live);
    emitter.emit("content_delta", { delta: "Hello " });
    emitter.emit("content_delta", { delta: "world" });
    emitter.emit("tool_result", { result: { key: "secret" } });
    emitter.emit("done", { status: "completed" });
    await emitter.flush();

    expect(h.events.map((event) => event.p_type)).toEqual(["content_delta", "done"]);
    expect(JSON.stringify(h.events)).not.toContain("secret");
    expect(live.emit).toHaveBeenCalledTimes(4);
  });

  it("does not strand turn execution when the activity projection is unavailable", async () => {
    h.failActivity = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
