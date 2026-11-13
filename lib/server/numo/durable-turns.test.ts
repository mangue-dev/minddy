import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "@/lib/server/ai-provider-errors";
import { resolveAiRuntime } from "@/lib/server/ai-runtime";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  turn: null as Record<string, unknown> | null,
  events: [] as Array<Record<string, unknown>>,
  checkpoints: [] as Array<Record<string, unknown>>,
  messages: [] as Array<Record<string, unknown>>,
  queuedTurns: [] as Array<Record<string, unknown>>,
  claims: [] as Array<Record<string, unknown>>,
  turnUpdates: [] as Array<Record<string, unknown>>,
  conversation: null as Record<string, unknown> | null,
  conversationUpdates: [] as Array<Record<string, unknown>>,
  historyFilters: [] as string[],
  failActivity: false,
  managedAi: false,
  operationSpent: 0,
  userUsage: {
    usedUsd: 0,
    period: { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" },
    billing: { plan: { id: "free", includedUsageUsd: 1 } },
  },
  processChat: vi.fn(),
  fetchModelIndex: vi.fn(),
  recordAiUsage: vi.fn(),
}));

function queryFor(table: string) {
  let inserted: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};
  const query = {
    select: () => query,
    update: (row: Record<string, unknown>) => {
      if (table === "numo_assistant_turns") h.turnUpdates.push(row);
      if (table === "conversations") h.conversationUpdates.push(row);
      return query;
    },
    or: (filter: string) => {
      if (table === "assistant_messages") h.historyFilters.push(filter);
      return query;
    },
    insert: (row: Record<string, unknown>) => {
      inserted = row;
      if (table === "assistant_messages") h.messages.push(row);
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return query;
    },
    is: () => query,
    not: () => query,
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
    maybeSingle: async () => ({
      data: table === "numo_assistant_turns" ? h.turn : table === "conversations" ? h.conversation : null,
      error: null,
    }),
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
      h.claims.push(args);
      h.turn = {
        ...h.turn,
        status: "running",
        claim_token: args.p_claim_token,
        attempts: Number(h.turn?.attempts ?? 0) + 1,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "checkpoint_numo_turn") {
      if (h.turn?.status === "stopping" && args.p_status !== "stopped") return { data: [], error: null };
      h.checkpoints.push(args);
      h.turn = {
        ...h.turn,
        status: args.p_status,
        checkpoint: args.p_checkpoint,
        error_message: args.p_error_message,
      };
      return { data: [h.turn], error: null };
    }
    if (name === "checkpoint_numo_tool_round") {
      if (h.turn?.status === "stopping") return { data: [], error: null };
      const messageId = "assistant-tool-round";
      const checkpoint = {
        phase: "tools",
        assistantContent: args.p_content,
        assistantReasoning: args.p_reasoning,
        assistantMessageId: messageId,
        pendingToolCalls: args.p_tool_calls,
        completedToolCallIds: [],
        roundCount: args.p_round_count,
      };
      h.messages.push({
        id: messageId,
        turn_id: args.p_turn_id,
        role: "assistant",
        content: args.p_content,
        tool_calls: args.p_tool_calls,
      });
      h.turn = { ...h.turn, checkpoint };
      return { data: [h.turn], error: null };
    }
    if (name === "append_numo_turn_event") {
      if (h.failActivity) return { data: null, error: { message: "journal unavailable" } };
      h.events.push(args);
      return { data: {}, error: null };
    }
    if (name === "complete_numo_tool_operation") {
      return { data: h.turn?.claim_token === args.p_claim_token
        && ["running", "stopping"].includes(String(h.turn?.status)), error: null };
    }
    if (name === "recover_stale_numo_turns") return { data: 0, error: null };
    return { data: true, error: null };
  },
} as unknown as SupabaseClient;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/ai-provider-request", () => ({
  fetchAiProviderBytes: (...args: unknown[]) => h.fetchModelIndex(...args),
}));
vi.mock("@/lib/server/assistant/loop", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/assistant/loop")>(),
  AmbiguousToolExecutionError: class extends Error {},
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
vi.mock("@/lib/server/assistant/tools", () => ({
  CONVERSATION_ASSISTANT_TOOLS: [{ function: { name: "get_issue" } }, { function: { name: "get_help" } }, { function: { name: "ask_user" } },
    { function: { name: "create_watch" } }, { function: { name: "list_watches" } }, { function: { name: "remember" } }],
  ROUTINE_UNATTENDED_EXCLUDED_TOOLS: new Set(["ask_user", "propose_backlog"]),
}));
vi.mock("@/lib/server/web-search", () => ({ withoutWebSearch: (tools: unknown) => tools }));
vi.mock("@/lib/server/assistant/commands", () => ({ commandNote: () => "" }));
vi.mock("@/lib/server/assistant/sanitize", () => ({ sanitizeAssistantMessageContent: (value: unknown) => String(value ?? "") }));
vi.mock("@/lib/server/ai-usage", () => ({
  recordAiUsage: (...args: unknown[]) => h.recordAiUsage(...args),
  spentFromNumoOperation: vi.fn(async () => h.operationSpent),
}));
vi.mock("@/lib/server/usage", () => ({
  getUserUsage: vi.fn(async () => h.userUsage),
}));
vi.mock("@/lib/managed-services", () => ({
  isManagedAiEnabled: () => h.managedAi,
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: vi.fn() }));
vi.mock("./watch-clock", () => ({ notifyReminderOfNumoTurn: vi.fn() }));
// A typed mention reaches the model named for the conversation's user.
vi.mock("@/lib/server/mention-access", async () => {
  const { relabelMentions } = await import("@/lib/mention-link");
  return {
    markdownForReader: async (userId: string, markdown: string) =>
      relabelMentions(markdown, (link) => `${link.type} seen by ${userId}`),
  };
});
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: vi.fn() }));
const adminGate = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock("@/lib/server/assistant/admin-tools", () => ({
  ADMIN_ASSISTANT_TOOLS: [{ function: { name: "admin_get_instance_models" } }],
  ADMIN_PROMPT_BLOCK: "\n## Instance administration",
  ROUTINE_ADMIN_LIMIT_PROMPT_LINE: "Instance administration is never available in a routine.",
  BACKGROUND_ADMIN_PROMPT_BLOCK: "\n## Instance administration (background)",
  REMINDER_ADMIN_PROMPT_BLOCK: "\n## Instance administration (reminder)",
  ADMIN_BACKGROUND_GRANT: { background: true },
  ADMIN_TOOL_NAMES: new Set(["admin_get_instance_models"]),
  ADMIN_BACKGROUND_FREE_TOOLS: new Set(["admin_get_instance_models"]),
  ADMIN_READ_TOOLS: new Set(),
  adminGrantIsLive: adminGate.live,
}));


const { createDurableNumoEmitter, drainNumoTurns, executeNumoTurn } = await import("./turns");
const { NumoCompletionError } = await import("@/lib/server/assistant/loop");
const { supabaseServerFetch } = await import("@/lib/server/supabase-fetch");

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
  h.claims.length = 0;
  h.turnUpdates.length = 0;
  h.conversation = null;
  h.conversationUpdates.length = 0;
  h.historyFilters.length = 0;
  h.failActivity = false;
  h.managedAi = false;
  h.operationSpent = 0;
  h.userUsage = {
    usedUsd: 0,
    period: { start: "2026-09-01T00:00:00.000Z", end: "2026-10-01T00:00:00.000Z" },
    billing: { plan: { id: "free", includedUsageUsd: 1 } },
  };
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
  h.fetchModelIndex.mockReset();
  h.fetchModelIndex.mockRejectedValue(new Error("Catalog unavailable"));
  h.recordAiUsage.mockReset();
  vi.mocked(resolveAiRuntime).mockResolvedValue(runtime as never);
  adminGate.live.mockReset().mockResolvedValue(true);
  h.processChat.mockResolvedValue({
    fullContent: "Done without code.",
    finalReasoning: null,
    allToolCalls: [],
    generations: [],
    suspension: null,
  });
});

describe("durable Numo execution", () => {
  it("resumes after the stored summary and keeps compaction steps out of the history (MIN-954)", async () => {
    h.conversation = {
      context_summary: "The user audits MIN-42.",
      context_summary_through_at: "2026-11-10T00:43:52.394446+00:00",
      context_summary_through_id: "51600000-0000-4000-8000-0000000000c1",
    };
    h.messages.push(
      { id: "step-result", turn_id: h.turn!.id, role: "tool", content: "{\"status\":\"compacted\"}",
        tool_calls: null, tool_call_id: "compact_1", tool_name: "compact_context",
        metadata: { success: true, context_compaction: true }, context: null },
      { id: "step-call", turn_id: h.turn!.id, role: "assistant", content: null,
        tool_calls: [{ id: "compact_1", type: "function", function: { name: "compact_context", arguments: "{}" } }],
        tool_call_id: null, tool_name: null, metadata: { context_compaction: true }, context: null },
    );
    await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service });
    expect(h.historyFilters).toEqual([
      'created_at.gt."2026-11-10T00:43:52.394446+00:00",and(created_at.eq."2026-11-10T00:43:52.394446+00:00",id.gt.51600000-0000-4000-8000-0000000000c1)',
    ]);
    const [messages, , , context] = h.processChat.mock.calls[0];
    expect(context.compaction.summary).toBe("The user audits MIN-42.");
    expect(messages.map((message: { role: string }) => message.role)).toEqual(["system", "user"]);
    expect(context.compaction.originOf(messages[1])).toEqual(expect.objectContaining({ id: "user-message" }));

    await context.compaction.persist({ summary: "New notes.", through: { id: "user-message", createdAt: "2026-11-10T01:00:00Z" } });
    expect(h.conversationUpdates).toEqual([{ context_summary: "New notes.",
      context_summary_through_at: "2026-11-10T01:00:00Z", context_summary_through_id: "user-message" }]);
  });
  it("uses the published guide and only help tools for a documentation turn", async () => {
    h.turn = { ...h.turn!, intent: { ...(h.turn!.intent as object), locale: "fr", documentation: { articleId: "numo" } } };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [messages, tools, , context] = h.processChat.mock.calls[0];
    expect(messages[0].content).toContain("documentation assistant");
    expect(messages[0].content).toContain("https://minddy.app/fr/documentation/numo");
    expect(messages[0].content).toContain("Use idiomatic French");
    expect(tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["get_help"]);
    expect(context).toMatchObject({ documentationHelp: true, userId: h.turn.user_id });
    expect(resolveAiRuntime).toHaveBeenCalledWith(expect.objectContaining({ managedOnly: true }));
  });
  it("names a message's typed mentions for its user in what the model reads (MIN-872)", async () => {
    h.messages[0] = { ...h.messages[0], content: "Review [@](mention:issue/i1) today" };
    await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service });
    const [messages] = h.processChat.mock.calls[0];
    const user = messages.find((message: { role: string }) => message.role === "user");
    expect(user.content).toBe(`Review [@issue seen by ${h.turn!.user_id}](mention:issue/i1) today`);
  });
  it("reads its Home summary as its own opening message, mentions named (MIN-933)", async () => {
    // The fixture returns rows newest first, as the query orders them: the
    // summary, written before the user's message, goes after it here.
    h.messages.push({
      id: "home-brief-message",
      turn_id: null,
      role: "assistant",
      content: "[@](mention:project/p1) is still empty",
      tool_calls: null,
      tool_call_id: null,
      tool_name: null,
      metadata: { home_brief: "51600000-0000-4000-8000-0000000000b1" },
      context: null,
    });
    await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service });
    const [messages] = h.processChat.mock.calls[0];
    expect(messages[0].content).toContain("## Opening of this conversation");
    const opening = messages.find((message: { role: string }) => message.role === "assistant");
    expect(opening.content).toBe(`[@project seen by ${h.turn!.user_id}](mention:project/p1) is still empty`);
    expect(messages.findIndex((message: { role: string }) => message.role === "assistant"))
      .toBeLessThan(messages.findIndex((message: { role: string }) => message.role === "user"));
  });
  it("offers the admin tools only while the recorded admin session is live (MIN-829)", async () => {
    const adminSession = { sessionId: "51600000-0000-4000-8000-000000000009", aal: "aal2", amr: [] };
    h.turn = { ...h.turn!, intent: { ...(h.turn!.intent as object), adminSession } };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [messages, tools, , context] = h.processChat.mock.calls[0];
    expect(adminGate.live).toHaveBeenCalledWith(h.turn.user_id, adminSession);
    expect(tools.map((tool: { function: { name: string } }) => tool.function.name)).toContain("admin_get_instance_models");
    expect(messages[0].content).toContain("Instance administration");
    expect(context).toMatchObject({ adminGrant: adminSession });

    h.processChat.mockClear();
    adminGate.live.mockResolvedValue(false);
    h.turn = { ...h.turn!, status: "queued" };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [lostMessages, lostTools, , lostContext] = h.processChat.mock.calls[0];
    expect(lostTools.map((tool: { function: { name: string } }) => tool.function.name)).not.toContain("admin_get_instance_models");
    expect(lostMessages[0].content).not.toContain("Instance administration");
    expect(lostContext).toMatchObject({ adminGrant: null });
  });

  it("tells a routine that instance administration is out of reach, even with an admin session (MIN-944)", async () => {
    const adminSession = { sessionId: "51600000-0000-4000-8000-000000000009", aal: "aal2", amr: [] };
    h.turn = { ...h.turn!, intent: { ...(h.turn!.intent as object), routineId: "routine-1", adminSession } };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [messages, tools, , context] = h.processChat.mock.calls[0];
    expect(adminGate.live).not.toHaveBeenCalled();
    expect(tools.map((tool: { function: { name: string } }) => tool.function.name)).not.toContain("admin_get_instance_models");
    expect(messages[0].content).toContain("## Routine occurrence");
    expect(messages[0].content).toContain("Instance administration is never available in a routine.");
    expect(messages[0].content).not.toContain("## Instance administration");
    expect(context).toMatchObject({ adminGrant: null });
  });

  it("gives an admin account's background turn the admin tools without a session (MIN-944)", async () => {
    h.turn = { ...h.turn!, intent: { ...(h.turn!.intent as object), wake: { batchId: "batch-1" } } };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [messages, tools, , context] = h.processChat.mock.calls[0];
    expect(adminGate.live).toHaveBeenCalledWith(h.turn.user_id, { background: true });
    const names = tools.map((tool: { function: { name: string } }) => tool.function.name);
    expect(names).toContain("admin_get_instance_models");
    expect(names).not.toContain("ask_user");
    expect(messages[0].content).toContain("## Instance administration (background)");
    expect(context).toMatchObject({ adminGrant: { background: true }, proactive: true });

    h.processChat.mockClear();
    adminGate.live.mockResolvedValue(false);
    h.turn = { ...h.turn!, status: "queued" };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service });
    const [lostMessages, lostTools, , lostContext] = h.processChat.mock.calls[0];
    expect(lostTools.map((tool: { function: { name: string } }) => tool.function.name)).not.toContain("admin_get_instance_models");
    expect(lostMessages[0].content).not.toContain("Instance administration");
    expect(lostContext).toMatchObject({ adminGrant: null });
  });

  it("never offers the admin tools to a turn without an admin session", async () => {
    await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service });
    const [, tools] = h.processChat.mock.calls[0];
    expect(adminGate.live).not.toHaveBeenCalled();
    expect(tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["get_issue", "get_help", "ask_user", "create_watch", "list_watches", "remember"]);
  });

  it("streams a text answer before a cold OpenRouter catalog finishes loading", async () => {
    let releaseCatalog!: () => void;
    h.fetchModelIndex.mockReturnValue(new Promise((resolve) => {
      releaseCatalog = () => resolve({ ok: true, bytes: Buffer.from('{"data":[]}') });
    }));
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    h.processChat.mockImplementationOnce(async (_messages, _tools, emitter) => {
      emitter.emit("content_delta", { delta: "Immediate answer" });
      return { fullContent: "Immediate answer", finalReasoning: null,
        allToolCalls: [], generations: [], suspension: null };
    });
    const execution = executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: { ...runtime, provider: "openrouter" },
      liveEmitter: live,
    });
    try {
      await vi.waitFor(() => {
        expect(live.emit).toHaveBeenCalledWith("content_delta", { delta: "Immediate answer" });
      });
      expect(h.fetchModelIndex).toHaveBeenCalledOnce();
      expect((await execution).status).toBe("completed");
    } finally {
      releaseCatalog();
      await execution;
    }
  });

  it("marks every database write of the turn as Numo's (MIN-926)", async () => {
    // A tool such as update_issues writes through the turn's clients, whose
    // transport adds the actor headers the event journal records.
    const transport = vi.fn<typeof fetch>(async () => new Response("[]"));
    vi.stubGlobal("fetch", transport);
    try {
      h.processChat.mockImplementationOnce(async () => {
        await supabaseServerFetch("https://project.supabase.co/rest/v1/issues?id=eq.1", { method: "PATCH" });
        return { fullContent: "Done.", finalReasoning: null, allToolCalls: [], generations: [], suspension: null };
      });
      await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service });
      const headers = new Headers(transport.mock.calls[0]?.[1]?.headers);
      expect(headers.get("x-minddy-actor-kind")).toBe("numo");
      expect(headers.get("x-minddy-actor-id")).toBe(h.turn!.user_id);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the model frozen on the admitted turn after a runtime change", async () => {
    h.turn = { ...h.turn!, model: "selected-model" };
    await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: { ...runtime, model: "account-default" },
    });

    expect(h.processChat.mock.calls[0][3]).toMatchObject({
      model: "selected-model",
      aiRuntime: { model: "selected-model" },
    });
  });

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
    });
    expect(h.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: "Done without code.",
    }));
  });

  it("records each parent generation with the durable operation attribution", async () => {
    h.turn = {
      ...h.turn,
      attempts: 1,
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        routineId: "routine-1",
        operationBudgetUsd: 1.5,
        operationBudgetPercent: 15,
      },
    };

    await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const context = h.processChat.mock.calls[0][3] as {
      onGeneration: (
        generation: Record<string, unknown>,
        round: number,
      ) => Promise<void>;
    };
    await context.onGeneration({
      generationId: "generation-1",
      model: "model",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      cost: 0.02,
    }, 2);

    expect(h.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      runId: h.turn.run_id,
      feature: "routine_code",
      billTo: { userId: h.turn.user_id },
      conversationId: h.turn.conversation_id,
      numoTurnId: h.turn.id,
      routineId: "routine-1",
      generationId: "generation-1",
    }));
    expect(context).toMatchObject({
      operationBudgetUsd: 1.5,
      operationBudgetPercent: 15,
      routineId: "routine-1",
    });
    // A routine runs unattended: no tool that waits for the user (MIN-924).
    const offered = (h.processChat.mock.calls[0][1] as { function: { name: string } }[])
      .map((tool) => tool.function.name);
    expect(offered).toContain("get_issue");
    expect(offered).not.toContain("ask_user");
  });

  it("runs a reminder's turn unattended: no question, no memory write, no new reminder (MIN-923)", async () => {
    h.turn = {
      ...h.turn,
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        reminder: { watchId: "watch-1", projectId: "project-1", targetType: "issue", targetId: "issue-1" },
      },
    };
    await executeNumoTurn({ turnId: h.turn.id as string, readClient: service, aiRuntime: runtime });
    const offered = (h.processChat.mock.calls[0][1] as { function: { name: string } }[])
      .map((tool) => tool.function.name);
    expect(offered).toEqual(expect.arrayContaining(["get_issue", "list_watches"]));
    expect(offered).not.toContain("ask_user");
    expect(offered).not.toContain("create_watch");
    expect(offered).not.toContain("remember");
    expect(h.processChat.mock.calls[0][3]).toMatchObject({ reminder: true, memoryWritable: false, proactive: false });
    expect(String((h.processChat.mock.calls[0][0] as Array<{ content: unknown }>)[0].content))
      .toContain("## Reminder turn");
  });

  it("runs an occurrence of a recurring reminder under the background guard, with its grants (MIN-953)", async () => {
    const occurrence = (grants: string[]) => ({
      ...h.turn,
      status: "queued",
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        reminder: {
          watchId: "watch-1", projectId: "project-1", targetType: "date", targetId: null,
          recurring: { firedAt: "2026-11-09T18:00:00.000Z", grants },
        },
      },
    });
    const run = async () => {
      h.processChat.mockClear();
      await executeNumoTurn({ turnId: h.turn!.id as string, readClient: service, aiRuntime: runtime });
      const [messages, tools, , context] = h.processChat.mock.calls[0];
      return {
        prompt: String((messages as Array<{ content: unknown }>)[0].content),
        names: (tools as { function: { name: string } }[]).map((tool) => tool.function.name),
        context,
      };
    };

    // Without the administration grant, the account is not even asked.
    h.turn = occurrence(["notification"]);
    const plain = await run();
    expect(adminGate.live).not.toHaveBeenCalled();
    expect(plain.names).toEqual(expect.arrayContaining(["get_issue", "list_watches"]));
    for (const hidden of ["admin_get_instance_models", "ask_user", "create_watch", "remember"]) {
      expect(plain.names).not.toContain(hidden);
    }
    expect(plain.prompt).toContain("## Recurring reminder turn");
    expect(plain.prompt).not.toContain("Instance administration");
    expect(plain.context).toMatchObject({
      reminder: true, proactive: true, reminderGrants: ["notification"], memoryWritable: false, adminGrant: null,
    });

    // With it, an account that is an admin NOW gets the admin tools.
    h.turn = occurrence(["administration"]);
    const admin = await run();
    expect(adminGate.live).toHaveBeenCalledWith(h.turn.user_id, { background: true });
    expect(admin.names).toContain("admin_get_instance_models");
    expect(admin.prompt).toContain("## Instance administration (reminder)");
    expect(admin.context).toMatchObject({ adminGrant: { background: true }, reminderGrants: ["administration"] });

    // The same reminder, once the account is no longer an admin: nothing.
    adminGate.live.mockResolvedValue(false);
    h.turn = occurrence(["administration"]);
    const lost = await run();
    expect(lost.names).not.toContain("admin_get_instance_models");
    expect(lost.prompt).not.toContain("Instance administration");
    expect(lost.context).toMatchObject({ adminGrant: null, reminderGrants: ["administration"] });
  });

  it("finishes with unified account exhaustion details before another generation", async () => {
    h.managedAi = true;
    h.userUsage = {
      usedUsd: 1,
      period: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
      },
      billing: { plan: { id: "free", includedUsageUsd: 1 } },
    };
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as { beforeGeneration: () => Promise<void> };
      await context.beforeGeneration();
      throw new Error("unreachable");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("completed");
    expect(h.messages).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: null,
      metadata: {
        usage_exhausted: expect.objectContaining({
          cause: "account",
          percent: 100,
          resetsAt: "2026-10-01T00:00:00.000Z",
          byok: false,
        }),
      },
    }));
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "completed" });
  });

  // MIN-869: a turn holds no allocation of its own; only the account
  // allowance (and a routine's cap) stops a managed operation.
  it("lets a managed operation keep generating while the account has budget", async () => {
    h.managedAi = true;
    h.userUsage.usedUsd = 0.6;
    h.operationSpent = 0.5;
    let generated = false;
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      await (args[3] as { beforeGeneration: () => Promise<void> }).beforeGeneration();
      generated = true;
      return { generations: [], fullContent: "Done" };
    });
    await executeNumoTurn({ turnId: h.turn?.id as string, readClient: service, aiRuntime: runtime });
    expect(generated).toBe(true);
  });

  it("reports one routine cap across the parent operation on BYOK", async () => {
    h.managedAi = true;
    h.operationSpent = 0.25;
    h.turn = {
      ...h.turn,
      intent: {
        ...(h.turn?.intent as Record<string, unknown>),
        routineId: "routine-1",
        operationBudgetUsd: 0.25,
        operationBudgetPercent: 25,
      },
    };
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as { beforeGeneration: () => Promise<void> };
      await context.beforeGeneration();
      throw new Error("unreachable");
    });

    const result = await executeNumoTurn({
      turnId: h.turn.id as string,
      readClient: service,
      aiRuntime: { ...runtime, mode: "byok" },
    });

    expect(result.status).toBe("completed");
    expect(h.messages).toContainEqual(expect.objectContaining({
      metadata: {
        usage_exhausted: expect.objectContaining({
          cause: "routine_cap",
          percent: 25,
          routineId: "routine-1",
          byok: true,
        }),
      },
    }));
  });

  it("moves interrupted initial work to retryable instead of leaving it running", async () => {
    h.turn = turn({ phase: "model" });
    const result = await executeNumoTurn({ turnId: h.turn.id as string, aiRuntime: runtime });

    expect(result.status).toBe("retryable");
    expect(h.processChat).not.toHaveBeenCalled();
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "retryable" });
  });

  it("actually resumes a queued turn whose request died before dispatch", async () => {
    h.queuedTurns.push({ id: h.turn!.id, checkpoint: {} });

    await expect(drainNumoTurns({ limit: 1 })).resolves.toEqual({ claimed: 1 });
    // The drain executes the turn with the service read client: claiming it
    // without one would flip it straight back to `retryable` without ever
    // running it, and the cron would churn the lease every minute.
    expect(h.processChat).toHaveBeenCalled();
  });

  it("resumes a retryable turn stranded by a dead background dispatch", async () => {
    // A server-started turn (PR review, routine) whose process died leaves
    // nobody around to press "Retry": the drain must pick it up itself.
    h.queuedTurns.push({ id: h.turn!.id, checkpoint: {}, status: "retryable" });

    await expect(drainNumoTurns({ limit: 1 })).resolves.toEqual({ claimed: 1 });
    expect(h.claims.at(-1)).toMatchObject({ p_allow_retryable: true });
    expect(h.processChat).toHaveBeenCalled();
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

  it("fails a turn the provider rejected, with its cause, instead of retrying (MIN-826)", async () => {
    h.processChat.mockRejectedValue(new ProviderRequestError({
      provider: "anthropic",
      model: "claude-opus-5-5",
      status: 400,
      providerErrorType: "invalid_request_error",
      providerMessage: "Adaptive thinking is not available via the OpenAI compatibility endpoint.",
    }));

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string, readClient: service, aiRuntime: runtime,
    });

    expect(result.status).toBe("failed");
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "failed",
      p_error_message: expect.stringContaining("Adaptive thinking is not available"),
    });
  });

  it("keeps retrying a provider failure that may pass later", async () => {
    h.processChat.mockRejectedValue(new ProviderRequestError({
      provider: "openrouter", model: "m", status: 529, providerMessage: "Overloaded",
    }));

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string, readClient: service, aiRuntime: runtime,
    });

    expect(result.status).toBe("retryable");
  });

  it("reports exhausted completion repairs as failure while preserving the durable checkpoint", async () => {
    const checkpoint = { phase: "model", roundCount: 3, completionRepairs: 2,
      completionRepairPending: false, completionRepairExhausted: true };
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as {
        persistCheckpoint: (checkpoint: Record<string, unknown>) => Promise<void>;
      };
      await context.persistCheckpoint(checkpoint);
      throw new NumoCompletionError("a tool call was returned as text");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string, readClient: service, aiRuntime: runtime,
    });

    expect(result.status).toBe("failed");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "failed",
      p_checkpoint: checkpoint,
      p_error_message: expect.stringContaining("a tool call was returned as text") });
    expect(h.messages.filter((message) => message.role === "assistant")).toEqual([]);
    expect(h.events).toContainEqual(expect.objectContaining({ p_type: "error" }));
  });

  it("persists the assistant tool round through the atomic checkpoint RPC", async () => {
    h.processChat.mockImplementation(async (...args: unknown[]) => {
      const context = args[3] as {
        persistToolRound: (input: Record<string, unknown>) => Promise<string>;
      };
      const messageId = await context.persistToolRound({
        assistantContent: "I will inspect it.",
        assistantReasoning: null,
        pendingToolCalls: [{
          id: "call-1",
          type: "function",
          function: { name: "get_issue", arguments: "{}" },
        }],
        roundCount: 1,
      });
      expect(messageId).toBe("assistant-tool-round");
      throw new Error("process interrupted after checkpoint");
    });

    const result = await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    expect(result.status).toBe("retryable");
    expect(h.messages).toContainEqual(expect.objectContaining({
      id: "assistant-tool-round",
      tool_calls: [expect.objectContaining({ id: "call-1" })],
    }));
    expect(h.checkpoints.at(-1)).toMatchObject({
      p_status: "retryable",
      p_checkpoint: expect.objectContaining({
        phase: "tools",
        assistantMessageId: "assistant-tool-round",
      }),
    });
  });

  it("handles revoked tool checkpoint authority", async () => {
    h.processChat.mockImplementation(async (_messages, _tools, _emitter, context) => {
      h.turn = { ...h.turn, status: "stopping" };
      await context.persistToolRound({ assistantContent: "Preparing a tool", assistantReasoning: null,
        pendingToolCalls: [], roundCount: 1 });
      throw new Error("A revoked tool checkpoint must not resume the model");
    });
    const result = await executeNumoTurn({ turnId: h.turn!.id as string,
      readClient: service, aiRuntime: runtime });
    expect(result.status).toBe("stopped");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "stopped" });
  });

  it("finishes Numo stopping after an execution failure", async () => {
    h.processChat.mockImplementation(async () => {
      h.turn = { ...h.turn, status: "stopping" };
      throw new Error("Provider connection closed during Stop");
    });
    const result = await executeNumoTurn({ turnId: h.turn!.id as string,
      readClient: service, aiRuntime: runtime });
    expect(result.status).toBe("stopped");
    expect(h.checkpoints.at(-1)).toMatchObject({ p_status: "stopped" });
  });

  it("returns the authoritative stopped state when a mutation finishes after its claim was revoked", async () => {
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    h.processChat.mockImplementation(async (_messages, _tools, _emitter, context) => {
      h.turn = { ...h.turn, status: "stopped", claim_token: null, claimed_at: null };
      // The real ledger adapter detects the failed completion CAS and hands
      // control back through NumoClaimLostError rather than retrying the write.
      await context.toolLedger.complete({ toolCallId: "write-issue", success: true,
        result: { updated: true }, modelResult: { updated: true }, pause: false });
      throw new Error("A revoked mutation must not resume the model");
    });
    const result = await executeNumoTurn({ turnId: h.turn!.id as string,
      readClient: service, aiRuntime: runtime, liveEmitter: live });
    expect(result.status).toBe("stopped");
    expect(live.emit).toHaveBeenCalledWith("done", { status: "stopped" });
    expect(live.emit.mock.calls.some(([event]) => event === "error" || event === "tool_result")).toBe(false);
    expect(h.checkpoints).toEqual([]);
    expect(h.messages).toHaveLength(1);
    expect(h.processChat).toHaveBeenCalledOnce();
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
        turn_id: h.turn!.id,
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
        turn_id: h.turn!.id,
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
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = JSON.stringify(h.processChat.mock.calls[0][0]);
    expect(executionMessages).toContain("Prior narration");
    expect(executionMessages).toContain("Prior result");
    expect(executionMessages).not.toContain("Pending narration");
  });

  it("drops leading tool results when the bounded history cuts through a batch", async () => {
    h.messages.length = 0;
    h.messages.push(
      {
        id: "user-message",
        turn_id: h.turn!.id,
        role: "user",
        content: "Continue with valid history",
        tool_calls: null,
        tool_call_id: null,
        tool_name: null,
        metadata: {},
        context: null,
      },
      {
        id: "orphaned-window-tool",
        turn_id: "older-turn",
        role: "tool",
        content: "Result whose assistant call fell outside the window",
        tool_calls: null,
        tool_call_id: "older-call",
        tool_name: "get_issue",
        metadata: {},
        context: null,
      },
    );

    await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = h.processChat.mock.calls[0][0] as Array<{ role: string }>;
    expect(executionMessages.map((message) => message.role)).toEqual(["system", "user"]);
  });

  it("replays an earlier tool result under its own tool's ceiling (MIN-974)", async () => {
    // A page read whole in an earlier turn: past the 12,000-character chat
    // message cap, with indentation the message sanitizer used to collapse.
    const page = JSON.stringify({ markdown: "```ts\n    indented();\n```\n".repeat(1_600) });
    const members = JSON.stringify({ members: "m".repeat(40_000) });
    expect(page.length).toBeGreaterThan(30_000);
    h.messages.length = 0;
    const call = (id: string, name: string, args: string) =>
      ({ id, type: "function", function: { name, arguments: args } });
    const row = (id: string, fields: Record<string, unknown>) => ({
      id, turn_id: "older-turn", content: null, tool_calls: null, tool_call_id: null,
      tool_name: null, metadata: {}, context: null, ...fields,
    });
    h.messages.push(
      row("user-earlier", { role: "user", content: "Read the page and the members" }),
      row("assistant-earlier", {
        role: "assistant",
        content: "",
        tool_calls: [call("call-page", "get_page", "{\"page_id\":\"p\"}"),
          call("call-members", "list_members", "{}")],
      }),
      row("tool-page", { role: "tool", content: page, tool_call_id: "call-page", tool_name: "get_page" }),
      row("tool-members", { role: "tool", content: members, tool_call_id: "call-members", tool_name: "list_members" }),
      row("assistant-answer", { role: "assistant", content: "Done." }),
      { ...row("user-now", { role: "user", content: "Is the whole page there?" }), turn_id: h.turn!.id },
    );

    await executeNumoTurn({
      turnId: h.turn!.id as string,
      readClient: service,
      aiRuntime: runtime,
    });

    const executionMessages = h.processChat.mock.calls[0][0] as Array<{ role: string; name?: string; content: unknown }>;
    const replayed = (name: string) =>
      executionMessages.find((message) => message.role === "tool" && message.name === name)?.content;
    expect(replayed("get_page")).toBe(page);
    expect(replayed("list_members")).toBe(`${members.slice(0, 16_000)}... [truncated: only the first 16000 of ${
      members.length} characters of this result were shown]`);
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

  it("batches streamed reasoning snapshots and always re-states the final trace", async () => {
    const live = { emit: vi.fn(), close: vi.fn(), isClosed: false };
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string, live);
    emitter.emit("reasoning_start", { started_at: "2026-09-05T12:00:00.000Z" });
    emitter.emit("reasoning_delta", { text: "First" });
    emitter.emit("reasoning_delta", { text: "First, second" });
    emitter.emit("reasoning_end", { duration_ms: 900, text: "First, second, third" });
    await emitter.flush();

    // Only the LATEST snapshot is journaled, before the end event that
    // re-states the whole trace — a replay ends on the authoritative text.
    expect(h.events.map((event) => event.p_type)).toEqual([
      "reasoning_start",
      "reasoning_delta",
      "reasoning_end",
    ]);
    const delta = h.events.find((event) => event.p_type === "reasoning_delta");
    expect(delta?.p_payload).toEqual({ text: "First, second" });
    // The live feed forwards every snapshot untouched.
    expect(live.emit).toHaveBeenCalledWith("reasoning_delta", { text: "First" });
    expect(live.emit).toHaveBeenCalledWith("reasoning_delta", { text: "First, second" });
  });

  it("publishes partial output to reconnecting readers before the generation finishes", async () => {
    vi.useFakeTimers();
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string);
    try {
      emitter.emit("content_delta", { delta: "First " });
      emitter.emit("content_delta", { delta: "batch" });
      await vi.advanceTimersByTimeAsync(249);
      expect(h.events).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.events.map(event => event.p_payload)).toEqual([{ delta: "First batch" }]);

      // A later batch contains only new text; polling readers concatenate it.
      emitter.emit("content_delta", { delta: ", next batch" });
      await vi.advanceTimersByTimeAsync(250);
      expect(h.events.map(event => event.p_payload)).toEqual([
        { delta: "First batch" }, { delta: ", next batch" },
      ]);
      expect(h.events.some(event => event.p_type === "done")).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      emitter.close();
      await emitter.flush();
      vi.useRealTimers();
    }
  });

  it("publishes the latest live reasoning snapshot on each durable batch", async () => {
    vi.useFakeTimers();
    const emitter = createDurableNumoEmitter(service, h.turn!.id as string);
    try {
      emitter.emit("reasoning_start", { started_at: "2026-09-05T12:00:00.000Z" });
      emitter.emit("reasoning_delta", { text: "First" });
      emitter.emit("reasoning_delta", { text: "First, second" });
      await vi.advanceTimersByTimeAsync(250);
      expect(h.events.at(-1)).toMatchObject({
        p_type: "reasoning_delta", p_payload: { text: "First, second" },
      });
      emitter.emit("reasoning_delta", { text: "First, second, third" });
      emitter.emit("reasoning_end", { duration_ms: 300, text: "First, second, third" });
      emitter.emit("done", { status: "completed" });
      await emitter.flush();
      expect(h.events.map(event => event.p_type)).toEqual([
        "reasoning_start", "reasoning_delta", "reasoning_delta", "reasoning_end", "done",
      ]);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(h.events).toHaveLength(5);
    } finally {
      emitter.close();
      await emitter.flush();
      vi.useRealTimers();
    }
  });

  it("serializes timed journal writes behind a slow append without duplicating text", async () => {
    vi.useFakeTimers();
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>(resolve => { releaseFirst = resolve; });
    const writes: Array<Record<string, unknown>> = [];
    const slowService = {
      ...service,
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name !== "append_numo_turn_event") return service.rpc(name, args);
        writes.push(args);
        if (writes.length === 1) await firstWrite;
        return { data: {}, error: null };
      },
    } as unknown as SupabaseClient;
    const emitter = createDurableNumoEmitter(slowService, h.turn!.id as string);
    try {
      emitter.emit("content_delta", { delta: "First" });
      await vi.advanceTimersByTimeAsync(250);
      expect(writes).toHaveLength(1);
      emitter.emit("content_delta", { delta: "Second" });
      await vi.advanceTimersByTimeAsync(250);
      expect(writes).toHaveLength(1);
      releaseFirst();
      await emitter.flush();
      expect(writes.map(event => event.p_payload)).toEqual([
        { delta: "First" }, { delta: "Second" },
      ]);
    } finally {
      releaseFirst();
      emitter.close();
      await emitter.flush();
      vi.useRealTimers();
    }
  });

  it.each(["done", "error", "close", "flush"] as const)(
    "flushes pending text and cancels its timer on %s", async (boundary) => {
      vi.useFakeTimers();
      const emitter = createDurableNumoEmitter(service, h.turn!.id as string);
      try {
        emitter.emit("content_delta", { delta: "Pending" });
        if (boundary === "close") emitter.close();
        else if (boundary !== "flush") emitter.emit(boundary, {});
        await emitter.flush();
        expect(vi.getTimerCount()).toBe(0);
        expect(h.events.filter(event => event.p_type === "content_delta"))
          .toMatchObject([{ p_payload: { delta: "Pending" } }]);
        const count = h.events.length;
        await vi.advanceTimersByTimeAsync(1000);
        expect(h.events).toHaveLength(count);
      } finally {
        emitter.close();
        await emitter.flush();
        vi.useRealTimers();
      }
    },
  );

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
