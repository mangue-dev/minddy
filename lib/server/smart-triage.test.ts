import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Smart Triage orchestration (MIN-566) — the server half of the button.
 *
 * Pinned here: `off` is a loud no-op (no fetch beyond the project row, no
 * write, no decision); `rules` orders through the pure comparator and rewrites
 * the positions inside each column's current range; `jev` pre-flights the
 * ACTOR's budget, runs ONE decision per column, orders by score and keeps the
 * rules order when both engines fail. Access is enforced here (the service
 * client bypasses RLS).
 */

const {
  getProjectAccessMock,
  ensureUsageBudgetMock,
  runDecisionMock,
  buildSmartTriageSpecMock,
  fromMock,
} = vi.hoisted(() => ({
  getProjectAccessMock: vi.fn<
    (userId: string, projectId: string) => Promise<unknown>
  >(),
  ensureUsageBudgetMock: vi.fn<(userId: string, surface?: string) => Promise<unknown>>(),
  runDecisionMock: vi.fn<
    (
      spec: unknown,
      input: { billTo: unknown; projectId?: string | null }
    ) => Promise<unknown>
  >(),
  buildSmartTriageSpecMock: vi.fn<(input: unknown) => unknown>(),
  fromMock: vi.fn<(table: string) => unknown>(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: getProjectAccessMock,
}));
vi.mock("@/lib/server/usage", () => ({
  ensureUsageBudget: ensureUsageBudgetMock,
}));
vi.mock("@/lib/server/decisions/runner", () => ({
  runDecision: runDecisionMock,
}));
vi.mock("@/lib/server/decisions/prepare", () => ({
  buildSmartTriageSpec: buildSmartTriageSpecMock,
}));

import { runSmartTriage } from "./smart-triage";

/** The prepare builder is mocked, but the orchestration must still drive a
 * REAL spec shape through the runner: one score question per ticket id. */
function fakeSpec(input: {
  tickets: Array<{ id: string }>;
}): { useCase: string; state: unknown; questions: Array<{ key: string; kind: string }>; llm: unknown } {
  return {
    useCase: "smart_triage",
    state: { tickets: input.tickets },
    questions: input.tickets.map((ticket) => ({
      key: ticket.id,
      kind: "score",
    })),
    llm: {},
  };
}

const DB = {
  project: {
    id: "project-1",
    name: "minddy",
    smart_triage_mode: "off",
  },
  issues: [] as Array<Record<string, unknown>>,
  relations: [] as Array<Record<string, unknown>>,
  objectives: [] as Array<Record<string, unknown>>,
  categories: [] as Array<Record<string, unknown>>,
};

interface WriteRecord {
  payload: Record<string, unknown>;
  eqs: Array<[string, unknown]>;
}
let updates: WriteRecord[] = [];

/** A PostgREST chain reduced to what the run touches: filters are ignored,
 * the await / `maybeSingle()` resolve the table's rows, `update()` records its
 * payload and its `.eq("id", …)` target. */
function chain(table: string): unknown {
  const resolve = (): { data: unknown; error: unknown } => {
    switch (table) {
      case "projects":
        return { data: DB.project, error: null };
      case "issues":
        return { data: DB.issues, error: null };
      case "issue_relations":
        return { data: DB.relations, error: null };
      case "objectives":
        return { data: DB.objectives, error: null };
      case "categories":
        return { data: DB.categories, error: null };
      default:
        return { data: null, error: null };
    }
  };
  const query: Record<string, unknown> = {};
  let updating: WriteRecord | null = null;
  for (const method of ["select", "is", "not", "in", "or", "order", "limit", "range"]) {
    query[method] = () => query;
  }
  query.eq = (col: unknown, value: unknown) => {
    if (updating) updating.eqs.push([col as string, value]);
    return query;
  };
  query.update = (payload: unknown) => {
    updating = { payload: payload as Record<string, unknown>, eqs: [] };
    updates.push(updating);
    return query;
  };
  query.maybeSingle = () => Promise.resolve(resolve());
  query.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown
  ) => Promise.resolve(resolve()).then(onFulfilled);
  return query;
}

function issue(overrides: {
  id: string;
  status?: string;
  priority?: string;
  effort?: string | null;
  position?: number;
  created_at?: string;
  objective_id?: string | null;
}): Record<string, unknown> {
  return {
    title: `Ticket ${overrides.id}`,
    status: "todo",
    priority: "medium",
    effort: null,
    due_date: null,
    created_at: "2026-09-01T10:00:00Z",
    position: 1000,
    objective_id: null,
    issue_categories: [],
    ...overrides,
  };
}

beforeEach(() => {
  DB.project = { id: "project-1", name: "minddy", smart_triage_mode: "off" };
  DB.issues = [];
  DB.relations = [];
  DB.objectives = [];
  DB.categories = [];
  updates = [];
  fromMock.mockClear();
  fromMock.mockImplementation((table: string) => chain(table));
  getProjectAccessMock.mockResolvedValue({ isOwner: true });
  ensureUsageBudgetMock.mockResolvedValue({});
  runDecisionMock.mockResolvedValue(null);
  buildSmartTriageSpecMock.mockImplementation((input) => fakeSpec(input as Parameters<typeof fakeSpec>[0]));
});

describe("runSmartTriage — mode off", () => {
  it("is a loud no-op: no issues fetch, no write, no decision", async () => {
    DB.issues = [issue({ id: "a" }), issue({ id: "b" })];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result).toEqual({
      ok: true,
      mode: "off",
      moves: [],
      columns: 0,
      scored: false,
    });
    expect(ensureUsageBudgetMock).not.toHaveBeenCalled();
    expect(runDecisionMock).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
    // Only the project row was read (the access check is its own module).
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

describe("runSmartTriage — access", () => {
  it("answers projectNotFound when the caller cannot reach the project", async () => {
    DB.project.smart_triage_mode = "rules";
    getProjectAccessMock.mockResolvedValue(null);
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result).toEqual({ ok: false, status: 404, errorKey: "projectNotFound" });
  });
});

describe("runSmartTriage — rules mode", () => {
  it("orders each open column by the static rules and rewrites positions", async () => {
    DB.project.smart_triage_mode = "rules";
    DB.issues = [
      // todo: an open blocker (b), its blocked target (a), a plain one (c).
      issue({ id: "a", status: "todo", priority: "urgent", position: 10 }),
      issue({ id: "b", status: "todo", priority: "low", position: 20 }),
      issue({ id: "c", status: "todo", priority: "medium", position: 30 }),
      // backlog: one urgent quick win, one low-effort pair — exercises the
      // objective grouping.
      issue({ id: "d", status: "backlog", priority: "high", effort: "xl", position: 40 }),
      issue({ id: "e", status: "backlog", priority: "medium", effort: "xs", objective_id: "obj-1", position: 50 }),
      issue({ id: "f", status: "backlog", priority: "high", effort: "xs", objective_id: "obj-1", position: 60 }),
      // done: NEVER reordered, whatever its mode.
      issue({ id: "g", status: "done", priority: "low", position: 70 }),
      issue({ id: "h", status: "done", priority: "urgent", position: 80 }),
    ];
    DB.relations = [
      { id: "r1", source_id: "b", target_id: "a", type: "blocks", source_type: "issue", target_type: "issue" },
    ];

    const result = await runSmartTriage({
      projectId: "project-1",
      actorId: "user-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("rules");
    expect(result.columns).toBe(2);
    expect(result.scored).toBe(false);
    expect(ensureUsageBudgetMock).not.toHaveBeenCalled();
    expect(runDecisionMock).not.toHaveBeenCalled();
    expect(updates.length).toBeGreaterThan(0);

    const positionOf = (id: string): number => {
      // The orchestration skips no-change writes: an issue that keeps its
      // place reads its ORIGINAL position.
      const write = updates.find((u) => u.eqs.some(([, v]) => v === id));
      if (write) return write.payload.position as number;
      return DB.issues.find((row) => row.id === id)!.position as number;
    };
    // todo: the blocker first, the blocked last, the plain one between.
    expect(positionOf("b")).toBeLessThan(positionOf("c")!);
    expect(positionOf("c")).toBeLessThan(positionOf("a")!);
    // backlog: the quick wins (f, e) pass the expensive high (d); the
    // objective pair stays contiguous (e before f — e's rank? both xs... the
    // comparator orders the pair by rank: f(high) before e(medium)).
    expect(positionOf("f")).toBeLessThan(positionOf("e")!);
    expect(positionOf("e")).toBeLessThan(positionOf("d")!);
    // All rewritten positions stay inside the column's old range: the reorder
    // must not jump a project across the /all interleaving.
    expect(positionOf("b")!).toBeGreaterThanOrEqual(10);
    expect(positionOf("a")!).toBeLessThanOrEqual(30);
    // The done column is untouched.
    expect(updates.find((u) => u.eqs.some(([, v]) => v === "g"))).toBeUndefined();
    expect(updates.find((u) => u.eqs.some(([, v]) => v === "h"))).toBeUndefined();
  });

  it("skips single-ticket columns: there is no order to decide", async () => {
    DB.project.smart_triage_mode = "rules";
    DB.issues = [issue({ id: "a" })];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.columns).toBe(0);
    expect(updates).toEqual([]);
  });
});

describe("runSmartTriage — jev mode", () => {
  beforeEach(() => {
    DB.project.smart_triage_mode = "jev";
    DB.issues = [
      issue({ id: "a", position: 10, created_at: "2026-09-10T10:00:00Z" }),
      issue({ id: "b", position: 20, created_at: "2026-09-05T10:00:00Z" }),
      issue({ id: "c", position: 30, created_at: "2026-09-01T10:00:00Z" }),
    ];
  });

  it("pre-flights the ACTOR's budget, scores the column and orders by score", async () => {
    runDecisionMock.mockResolvedValue({
      engine: "jev",
      answers: {
        a: { value: 1, probability: null, confidence: 0.9 },
        b: { value: 5, probability: null, confidence: 0.9 },
        c: { value: 3, probability: null, confidence: 0.9 },
      },
      confidence: 0.9,
      fallbackReason: null,
    });

    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-9" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scored).toBe(true);
    expect(ensureUsageBudgetMock).toHaveBeenCalledWith("user-9", "automations");
    // ONE decision for the whole column, billed to the actor.
    expect(runDecisionMock).toHaveBeenCalledTimes(1);
    const [spec, input] = runDecisionMock.mock.calls[0];
    expect(input).toEqual({ billTo: { userId: "user-9" }, projectId: "project-1" });
    // The state paints the tickets with the facts the rules weigh.
    const state = (spec as { state: Record<string, unknown> }).state;
    expect(state.tickets).toHaveLength(3);

    const positionOf = (id: string): number =>
      updates.find((u) => u.eqs.some(([, v]) => v === id))!.payload.position as number;
    expect(positionOf("b")).toBeLessThan(positionOf("c"));
    expect(positionOf("c")).toBeLessThan(positionOf("a"));
  });

  it("degrades to the rules order when both engines fail, and says so", async () => {
    runDecisionMock.mockResolvedValue(null);
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-9" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scored).toBe(false);
    // Still a reorder: the rules order IS the degradation.
    expect(updates.length).toBeGreaterThan(0);
  });

  it("caps the scored head and keeps the rules order for the tail", async () => {
    DB.issues = Array.from({ length: 45 }, (_, i) =>
      issue({ id: `t${i}`, position: 100 + i, created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, "0")}Z` })
    );
    runDecisionMock.mockImplementation(async (spec: unknown) => {
      const questions = (spec as { questions: Array<{ key: string }> }).questions;
      const answers: Record<string, { value: number }> = {};
      for (const q of questions) answers[q.key] = { value: 5 };
      return {
        engine: "llm",
        answers,
        confidence: 0.9,
        fallbackReason: "jev_low_confidence",
      };
    });
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-9" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const spec = runDecisionMock.mock.calls[0][0] as {
      questions: unknown[];
      state: { tickets: unknown[] };
    };
    expect(spec.questions).toHaveLength(40);
    expect(spec.state.tickets).toHaveLength(40);
  });
});
