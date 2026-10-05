import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getProjectAccessMock,
  ensureUsageBudgetMock,
  runDecisionMock,
  fromMock,
  rpcMock,
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
  fromMock: vi.fn<(table: string) => unknown>(),
  rpcMock: vi.fn<
    (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  >(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: fromMock, rpc: rpcMock }),
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
import { runSmartTriage } from "./smart-triage";

const DB = {
  project: {
    id: "project-1",
    name: "minddy",
    smart_triage_mode: "rules",
  },
  issues: [] as Array<Record<string, unknown>>,
  relations: [] as Array<Record<string, unknown>>,
  objectives: [] as Array<Record<string, unknown>>,
  categories: [] as Array<Record<string, unknown>>,
};

/** The moves of the atomic RPC — the observable of the reorder. */
let writtenMoves: Array<{ id: string; position: number }> = [];
let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };

/** A PostgREST chain reduced to what the run touches: filters are ignored,
 * the await / `maybeSingle()` resolve the table's rows. The position writes
 * ride the atomic RPC, not this path. */
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
  for (const method of ["select", "eq", "is", "not", "in", "or", "order", "limit", "range"]) {
    query[method] = () => query;
  }
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
  DB.project = { id: "project-1", name: "minddy", smart_triage_mode: "rules" };
  DB.issues = [];
  DB.relations = [];
  DB.objectives = [];
  DB.categories = [];
  writtenMoves = [];
  rpcResult = { data: null, error: null };
  fromMock.mockClear();
  fromMock.mockImplementation((table: string) => chain(table));
  rpcMock.mockClear();
  rpcMock.mockImplementation(async (_name, params) => {
    writtenMoves = params.p_moves as Array<{ id: string; position: number }>;
    if (rpcResult.error) return rpcResult;
    return { data: writtenMoves.length, error: null };
  });
  getProjectAccessMock.mockResolvedValue({ isOwner: true });
  ensureUsageBudgetMock.mockResolvedValue({});
  runDecisionMock.mockResolvedValue(null);
});

describe("runSmartTriage — retired modes", () => {
  it.each(["off", "jev"])("uses rules for a legacy %s project without consulting AI or usage", async (mode) => {
    DB.project.smart_triage_mode = mode;
    ensureUsageBudgetMock.mockRejectedValue(new Error("Budget exhausted"));
    DB.issues = [issue({ id: "a" }), issue({ id: "b" })];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("rules");
    expect(rpcMock).toHaveBeenCalled();
    expect(runDecisionMock).not.toHaveBeenCalled();
    expect(ensureUsageBudgetMock).not.toHaveBeenCalled();
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
    expect(rpcMock).toHaveBeenCalledTimes(1);

    const positionOf = (id: string): number => {
      // The orchestration skips no-change writes: an issue that keeps its
      // place reads its ORIGINAL position.
      const write = writtenMoves.find((m) => m.id === id);
      if (write) return write.position;
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
    expect(writtenMoves.find((m) => m.id === "g")).toBeUndefined();
    expect(writtenMoves.find((m) => m.id === "h")).toBeUndefined();
    // The batch is atomic: ONE rpc call, scoped to the project.
    expect(rpcMock).toHaveBeenCalledWith("apply_smart_triage_moves", {
      p_project_id: "project-1",
      p_moves: expect.any(Array),
    });
  });

  it("skips single-ticket columns: there is no order to decide", async () => {
    DB.project.smart_triage_mode = "rules";
    DB.issues = [issue({ id: "a" })];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.columns).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("runSmartTriage — objective blocking (MIN-604)", () => {
  it.each([
    ["rules", "planned"], ["rules", "in_progress"], ["rules", "done"], ["rules", "canceled"],
    ["jev", "planned"], ["jev", "in_progress"], ["jev", "done"], ["jev", "canceled"],
  ])("%s: respects a member's blocking objective when it is %s", async (mode, status) => {
    DB.project.smart_triage_mode = mode;
    DB.objectives = [{ id: "obj-1", name: "Release", description: null, status }];
    DB.issues = [
      issue({ id: "member", objective_id: "obj-1", priority: "urgent", effort: "xs", position: 10 }),
      issue({ id: "target", priority: "high", position: 20 }),
      issue({ id: "free", priority: "low", position: 30 }),
    ];
    DB.relations = [
      { id: "r1", source_id: "obj-1", source_type: "objective", target_id: "member", target_type: "issue", type: "blocks" },
      { id: "r2", source_id: "member", source_type: "issue", target_id: "target", target_type: "issue", type: "blocks" },
    ];

    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result.ok).toBe(true);
    const positionOf = (id: string): number =>
      writtenMoves.find((move) => move.id === id)?.position ??
      DB.issues.find((row) => row.id === id)!.position as number;
    const ordered = DB.issues.slice()
      .sort((a, b) => positionOf(a.id as string) - positionOf(b.id as string))
      .map((row) => row.id);
    expect(ordered).toEqual(status === "planned" || status === "in_progress"
      ? ["free", "member", "target"]
      : ["member", "free", "target"]);
  });

  it.each(["rules", "jev"])("%s: sinks a member blocking its own objective", async (mode) => {
    DB.project.smart_triage_mode = mode;
    DB.objectives = [{ id: "obj-1", name: "Release", description: null, status: "planned" }];
    DB.issues = [
      issue({ id: "member", objective_id: "obj-1", priority: "urgent", position: 10 }),
      issue({ id: "free", priority: "low", position: 20 }),
    ];
    DB.relations = [
      { id: "r", source_id: "member", source_type: "issue", target_id: "obj-1", target_type: "objective", type: "blocks" },
    ];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1" });
    expect(result.ok).toBe(true);
    expect(writtenMoves).toEqual([{ id: "free", position: 10 }, { id: "member", position: 20 }]);
  });
});

describe("runSmartTriage — read-only requests", () => {
  it.each(["rules", "jev"])("preserves manual positions for a %s project when persist=false", async (mode) => {
    DB.project.smart_triage_mode = mode;
    DB.issues = [issue({ id: "a", priority: "low", position: 10 }), issue({ id: "b", priority: "urgent", position: 20 })];
    const result = await runSmartTriage({ projectId: "project-1", actorId: "user-1", persist: false });
    expect(result).toEqual({ ok: true, mode: "rules", columns: 1, moves: [], scored: false, scores: null });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(runDecisionMock).not.toHaveBeenCalled();
    expect(ensureUsageBudgetMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalledWith("categories");
  });
});
