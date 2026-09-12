import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: {} as unknown,
  process: vi.fn(),
  loadSkills: vi.fn(),
  claimError: false,
  steerWorker: vi.fn(),
  answerWorker: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => ({ ok: true, user: { id: "user", user_metadata: {} }, supabase: h.db }) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.db }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en", getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/session-rate-limit", () => ({ checkSessionRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/usage", () => ({ ensureUsageBudget: async () => {} }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: async () => ({ model: "test", provider: "local", apiKey: "test" }), ManagedAiUnavailableError: class extends Error {} }));
vi.mock("@/lib/server/assistant/prompt-context", () => ({ gatherProjectPromptContext: async ({ project }: { project: object }) => ({ ...project, statusCounts: {}, recentIssues: [], members: [], objectives: [], categories: [] }) }));
vi.mock("@/lib/server/short-title", () => ({ fallbackShortTitle: () => "Conversation", generateShortTitle: async () => null }));
vi.mock("@/lib/server/ai-usage", () => ({ newRunId: () => "run", recordAiUsage: async () => {} }));
vi.mock("@/lib/server/web-search", () => ({ isWebSearchEnabled: async () => true, withoutWebSearch: (tools: unknown) => tools }));
vi.mock("@/lib/server/assistant/reasoning", () => ({ getAssistantReasoningLevel: async () => "off" }));
vi.mock("@/lib/server/assistant/loop", () => ({ processChat: h.process, modelSupportsCaching: async () => false, getModelInputModalities: async () => new Set(["text"]) }));
vi.mock("@/lib/server/repository-skills", () => ({ loadProjectRepositorySkills: h.loadSkills }));
vi.mock("@/lib/server/numo/worker-mediation", () => ({
  steerNumoWorker: (...args: unknown[]) => h.steerWorker(...args),
  answerNumoWorkerInput: (...args: unknown[]) => h.answerWorker(...args),
}));

import { POST } from "@/app/api/assistant/chat/route";

function database({ owner = "user", status = "idle", visible = new Set(["a", "b"]) } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  const conversations: Array<Record<string, unknown>> = [];
  let turn: Record<string, unknown> | null = null;
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let inserted: Record<string, unknown> | undefined;
    let changed = false;
    const result = () => {
      if (inserted) return { data: { id: inserted.id ?? "conversation" }, error: null };
      if (changed) return { data: null, error: null };
      if (table === "projects" && Array.isArray(filters.id)) {
        return { data: filters.id.filter((id) => visible.has(id)).map((id) => ({ id })) };
      }
      if (table === "projects") return { data: visible.has(String(filters.id)) ? { id: filters.id, name: filters.id, key: "P", owner_id: "user" } : null };
      if (table === "conversations") return { data: filters.user_id === owner && (!Object.hasOwn(filters, "project_id") || filters.project_id === "a") ? { id: "conversation", status } : null };
      if (table === "assistant_messages") return { data: [...rows].reverse(), error: null };
      return { data: null, error: null };
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, values: string[]) => { filters[key] = values; return query; },
      is: (key: string, value: unknown) => { filters[key] = value; return query; },
      order: () => query,
      limit: () => query,
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        if (table === "assistant_messages") rows.push(row);
        if (table === "conversations") conversations.push(row);
        return query;
      },
      update: () => { changed = true; return query; },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_numo_turn") {
      if (status === "generating") return { data: null, error: { message: "conversation_busy" } };
      turn = {
        id: "turn",
        conversation_id: args.p_conversation_id,
        user_id: args.p_user_id,
        request_id: args.p_request_id,
        run_id: args.p_run_id,
        status: "queued",
        intent: args.p_intent,
        checkpoint: {},
        model: args.p_model,
        reasoning_level: args.p_reasoning_level,
        active_run_id: null,
        attempts: 0,
      };
      rows.push({
        conversation_id: args.p_conversation_id,
        turn_id: "turn",
        role: "user",
        content: args.p_content,
        context: args.p_context,
        metadata: args.p_metadata,
      });
      return { data: turn, error: null };
    }
    if (name === "claim_numo_turn") {
      if (h.claimError) return { data: null, error: { message: "database unavailable" } };
      turn = { ...turn, status: "running", claim_token: args.p_claim_token, attempts: 1 };
      return { data: [turn], error: null };
    }
    if (name === "checkpoint_numo_turn") {
      turn = { ...turn, status: args.p_status, checkpoint: args.p_checkpoint };
      return { data: [turn], error: null };
    }
    if (name === "append_numo_turn_event") return { data: {}, error: null };
    return { data: true, error: null };
  };
  h.db = { from, rpc };
  return { rows, conversations, visible };
}
async function send(body: Record<string, unknown>) {
  const response = await POST(new Request("http://localhost/api/assistant/chat", { method: "POST", body: JSON.stringify({ message: "Discuss this project", ...body }) }) as never);
  await response.text();
  return response.status;
}
beforeEach(() => {
  vi.clearAllMocks();
  h.claimError = false;
  h.steerWorker.mockResolvedValue({ action: "none" });
  h.answerWorker.mockResolvedValue({ action: "refused", reason: "ignored" });
  h.process.mockResolvedValue({ generations: [], fullContent: "Done" });
  h.loadSkills.mockImplementation(async (_project: string, paths: string[]) => paths.map((path) => ({ path, name: "review", description: "Review", source: ".agents/skills", content: "Review this repository." })));
});

describe("conversation identity across project contexts", () => {
  it("routes a message to the active worker before starting another Numo turn", async () => {
    database({ visible: new Set(["unavailable"]) });
    h.steerWorker.mockResolvedValue({
      action: "steered",
      turnId: "51600000-0000-4000-8000-000000000001",
      runId: "51600000-0000-4000-8000-000000000002",
    });

    expect(await send({ conversationId: "conversation", projectId: "unavailable" })).toBe(200);
    expect(h.steerWorker).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation",
      userId: "user",
      content: expect.stringContaining("Discuss this project"),
    }));
    expect(h.process).not.toHaveBeenCalled();
    expect(h.loadSkills).not.toHaveBeenCalled();
  });

  it("submits a correlated card answer without creating a competing Numo turn", async () => {
    database();
    const workerInput = {
      parentTurnId: "51600000-0000-4000-8000-000000000001",
      runId: "51600000-0000-4000-8000-000000000002",
      questionId: "question-1",
    };
    h.answerWorker.mockResolvedValue({
      action: "answered",
      turnId: workerInput.parentTurnId,
      runId: workerInput.runId,
    });

    expect(await send({ conversationId: "conversation", workerInput })).toBe(200);
    expect(h.answerWorker).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: "conversation",
      correlation: workerInput,
      answer: "Discuss this project",
      persistParentMessage: true,
    }));
    expect(h.process).not.toHaveBeenCalled();
  });

  it("refuses an uncorrelated message while a worker decision is pending", async () => {
    database();
    h.steerWorker.mockResolvedValue({
      action: "refused",
      reason: "worker_input_pending",
    });

    const response = await POST(new Request("http://localhost/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Continue", conversationId: "conversation" }),
    }) as never);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "worker_input_pending" });
    expect(h.process).not.toHaveBeenCalled();
  });

  it("continues the same conversation through A, B and a page without a project", async () => {
    const db = database();
    for (const projectId of ["a", "b", undefined]) {
      expect(await send({ conversationId: "conversation", projectId })).toBe(200);
    }
    const userRows = db.rows.filter((row) => row.role === "user");
    expect(userRows.map((row) => row.conversation_id)).toEqual(["conversation", "conversation", "conversation"]);
    expect(userRows.map((row) => row.context)).toEqual([{ projectId: "a" }, { projectId: "b" }, null]);
    const messages = h.process.mock.calls[2][0] as Array<{ role: string; content: string }>;
    const users = messages.filter((message) => message.role === "user");
    expect(users[0].content).toContain("Attached project (id: a)");
    expect(users[1].content).toContain("Attached project (id: b)");
    expect(users[2].content).not.toContain("Attached project");
    expect(h.process.mock.calls[2][3]).toMatchObject({ conversationId: "conversation", requireExplicitProjectTarget: true, projectId: null });
    expect(db.conversations).toEqual([]);
  });
  it("creates conversations without attaching identity to the first project", async () => {
    const db = database();
    expect(await send({ projectId: "a" })).toBe(200);
    expect(db.conversations).toEqual([expect.objectContaining({ project_id: null, user_id: "user" })]);
  });
  it("keeps polling possible when execution and its status lookup both fail", async () => {
    database();
    h.claimError = true;
    const response = await POST(new Request("http://localhost/api/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ message: "Continue durably", conversationId: "conversation" }),
    }) as never);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"status":"queued"');
  });
  it.each([{ owner: "other", expected: 404 }, { status: "generating", expected: 409 }])("retains ownership and concurrent generation checks: %s", async ({ expected, ...options }) => {
    database(options);
    expect(await send({ conversationId: "conversation", projectId: "b" })).toBe(expected);
    expect(h.process).not.toHaveBeenCalled();
  });
  it("authorizes each skill source before loading and preserves provenance on its message", async () => {
    const db = database();
    const path = ".agents/skills/review/SKILL.md";
    expect(await send({ conversationId: "conversation", projectId: "b", skills: [{ projectId: "a", path }, { projectId: "b", path }] })).toBe(200);
    expect(h.loadSkills.mock.calls).toEqual([["a", [path]], ["b", [path]]]);
    expect(db.rows[0]).toMatchObject({ metadata: { skills: [{ projectId: "a", path }, { projectId: "b", path }] } });
    db.visible.delete("a");
    h.loadSkills.mockClear();
    expect(await send({ conversationId: "conversation", projectId: "b", skills: [{ projectId: "a", path }] })).toBe(404);
    expect(h.loadSkills).not.toHaveBeenCalled();
  });
  it.each([undefined, "b"])("reauthorizes historical skills when resuming with project %s", async (projectId) => {
    const db = database();
    const path = ".agents/skills/review/SKILL.md";
    h.loadSkills.mockImplementation(async (source: string) => [{
      path, name: "review", description: "Review", source: ".agents/skills",
      content: `Review checklist for repository ${source}.`,
    }]);
    await send({ conversationId: "conversation", projectId: "b", skills: [
      { projectId: "a", path }, { projectId: "b", path },
    ] });
    const historyPrompt = () => JSON.stringify(h.process.mock.calls.at(-1)![0]);
    expect(historyPrompt()).toContain("Review checklist for repository a.");

    db.visible.delete("a");
    h.loadSkills.mockClear();
    expect(await send({ conversationId: "conversation", projectId })).toBe(200);
    expect(historyPrompt()).not.toContain("Review checklist for repository a.");
    expect(historyPrompt()).toContain("Review checklist for repository b.");
    expect(h.loadSkills).not.toHaveBeenCalled();
    expect(db.rows[0]).toMatchObject({ metadata: { skills: [
      { projectId: "a", content: "Review checklist for repository a." },
      { projectId: "b", content: "Review checklist for repository b." },
    ] } });

    db.visible.add("a");
    expect(await send({ conversationId: "conversation", projectId })).toBe(200);
    expect(historyPrompt()).toContain("Review checklist for repository a.");
  });
});
