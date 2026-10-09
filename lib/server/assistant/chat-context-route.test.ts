import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  db: {} as unknown,
  process: vi.fn(),
  loadSkills: vi.fn(),
  claimError: false,
  steerWorker: vi.fn(),
  answerWorker: vi.fn(),
  managed: false,
  reservation: null as null | { spent_usd: number; reserved_usd: number },
}));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => ({ ok: true, user: { id: "user", user_metadata: {} }, supabase: h.db }) }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => h.db }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en", getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/session-rate-limit", () => ({ checkSessionRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/usage", () => ({ ensureUsageBudget: async () => ({
  billing: { plan: { includedUsageUsd: 10 } }, period: { start: "2026-10-01", end: "2026-11-01" }, usedUsd: 0,
}) }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: async () => ({ model: "test", provider: "local", apiKey: "test", mode: h.managed ? "platform" : "byok" }), ManagedAiUnavailableError: class extends Error {} }));
vi.mock("@/lib/server/agent/models-catalog", () => ({
  getAssistantModelsForUser: async () => ({ models: [{ id: "test", reasoning: null }] }),
  getOpenRouterConversationModels: async () => [],
}));
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
import { SELF_HOSTING_OVERVIEW } from "@/lib/self-hosting-help-context";

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
      delete: () => { changed = true; return query; },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "begin_numo_turn_with_budget" && h.reservation) {
      return { data: { turn: null, ...h.reservation }, error: null };
    }
    if (name === "begin_numo_turn" || name === "begin_numo_turn_with_budget") {
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
      return { data: name === "begin_numo_turn_with_budget" ? { turn } : turn, error: null };
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
  h.managed = false;
  h.reservation = null;
  h.steerWorker.mockResolvedValue({ action: "none" });
  h.answerWorker.mockResolvedValue({ action: "refused", reason: "ignored" });
  h.process.mockResolvedValue({ generations: [], fullContent: "Done" });
  h.loadSkills.mockImplementation(async (_project: string, paths: string[]) => paths.map((path) => ({ path, name: "review", description: "Review", source: ".agents/skills", content: "Review this repository." })));
});

describe("conversation identity across project contexts", () => {
  it("uses the latest self-hosting step and choices while retaining public-help tools", async () => {
    const db = database();
    for (const stepId of ["desktop-app", "team-access"] as const) {
      const selfHosting = { ...SELF_HOSTING_OVERVIEW, stepId, path: "team", serverAccess: "public", supabaseMode: "full" };
      expect(await send({ conversationId: "conversation", pageContext: { documentation: {
        articleId: "installation", locale: "fr", selfHosting: { ...selfHosting, password: "must-not-reach-help", domain: "private.example" },
      } } })).toBe(200);
      expect(db.rows.findLast(row => row.role === "user")?.context).toEqual({ documentation: { articleId: "installation", locale: "fr", selfHosting } });
      const call = h.process.mock.calls.at(-1)!;
      expect(call[0][0].content).toContain(`(${stepId})`);
      expect(call[0][0].content).toContain('"serverAccess":"public"');
      expect(call[0][0].content).not.toContain("must-not-reach-help");
      expect(call[0][0].content).not.toContain("private.example");
      expect(call[1].map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["get_help"]);
    }
    expect(h.process.mock.calls.at(-1)![0][0].content).toContain("Comment accédera-t-on au serveur ?");
  });
  it.each([{ stepId: "invented-step" }, { method: "execute-arbitrary-command" }, { path: "../private" }])("rejects malformed wizard context: %s", async malformed => {
    database();
    expect(await send({ pageContext: { documentation: { articleId: "installation", locale: "en", selfHosting: { ...SELF_HOSTING_OVERVIEW, ...malformed } } } })).toBe(400);
    expect(h.process).not.toHaveBeenCalled();
  });
  it("admits documentation help with the guide locale, account billing and restricted execution", async () => {
    const db = database();
    h.managed = true;
    expect(await send({ pageContext: { documentation: { articleId: "numo", locale: "fr" } } })).toBe(200);
    expect(db.rows.find(row => row.role === "user")?.context).toEqual({ documentation: { articleId: "numo", locale: "fr" } });
    expect(h.process.mock.calls[0][1].map((tool: { function: { name: string } }) => tool.function.name)).toEqual(["get_help"]);
    expect(h.process.mock.calls[0][3]).toMatchObject({ documentationHelp: true, locale: "fr", userId: "user" });
  });
  it("rejects workspace attachments on a documentation request", async () => {
    database();
    expect(await send({ projectId: "project", pageContext: { documentation: { articleId: null, locale: "en" } } })).toBe(400);
    expect(h.process).not.toHaveBeenCalled();
  });
  it.each([{ articleId: "../private", locale: "fr" }, { articleId: null, locale: "unknown" }])("rejects malformed help context rather than opening an unrestricted assistant", async documentation => {
    database();
    expect(await send({ pageContext: { documentation } })).toBe(400);
    expect(h.process).not.toHaveBeenCalled();
  });
  it.each([
    { spent: 0.1, reserved: 9.9, status: 409, code: "usage_budget_reserved", copy: "usageBudgetReserved" },
    { spent: 10, reserved: 0, status: 403, code: "usage_budget_exceeded", copy: "usageBudgetExceeded" },
  ])("reports the atomic admission cause $code even when the preflight usage is stale", async ({ spent, reserved, status, code, copy }) => {
    database();
    h.managed = true;
    h.reservation = { spent_usd: spent, reserved_usd: reserved };
    const response = await POST(new Request("http://localhost/api/assistant/chat", {
      method: "POST", body: JSON.stringify({ message: "Hello", conversationId: "conversation" }),
    }) as never);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code, error: copy, params: { used: spent, included: 10 } });
    expect(h.process).not.toHaveBeenCalled();
  });

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
  it("persists voluntary entry provenance on the user message", async () => {
    const db = database();
    expect(await send({
      projectId: "a",
      intent: { source: "issue", action: "implement" },
    })).toBe(200);
    expect(db.rows[0]).toMatchObject({
      metadata: { intent: { source: "issue", action: "implement" } },
    });
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
