import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Smart Fill re-evaluation worker (MIN-750): which answers it may write,
 * and how a due pass is claimed, gated and applied. The model and the issue
 * write paths are mocked; the queue table is kept in memory.
 */

interface Row extends Record<string, unknown> {}

const { runSmartFill, updateIssueFields, setIssueCategories } = vi.hoisted(() => ({
  runSmartFill: vi.fn(),
  updateIssueFields: vi.fn(),
  setIssueCategories: vi.fn(),
}));

let queue: Row[] = [];
let issue: Row | null = null;
let categories: string[] = [];
let editorMeta: Record<string, unknown> = {};

function makeQuery(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let payload: Row | null = null;
  const rows = (): Row[] => {
    if (table === "issue_smart_fill") return queue;
    if (table === "issues") return issue ? [issue] : [];
    if (table === "issue_categories") return categories.map((category_id) => ({ category_id, issue_id: "issue-1" }));
    if (table === "projects") return [{ id: "project-1", name: "Project", deleted_at: null }];
    return [];
  };
  const matching = () => rows().filter((r) => filters.every((f) => f(r)));
  const run = () => {
    const matched = matching();
    if (payload) matched.forEach((r) => Object.assign(r, payload));
    return { data: matched.map((r) => ({ ...r })), error: null };
  };
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filters.push((r) => r[col] === val);
      return q;
    },
    is: (col: string, val: unknown) => {
      filters.push((r) => (r[col] ?? null) === val);
      return q;
    },
    lte: (col: string, val: string) => {
      filters.push((r) => r[col] != null && Date.parse(r[col] as string) <= Date.parse(val));
      return q;
    },
    order: () => q,
    limit: () => q,
    update: (values: Row) => {
      payload = values;
      return q;
    },
    maybeSingle: async () => ({ ...run(), data: run().data[0] ?? null }),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(run()).then(onFulfilled),
  });
  return q;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => makeQuery(table),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: id === "editor-1" ? { id, user_metadata: editorMeta } : null },
          error: null,
        }),
      },
    },
  }),
}));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => makeQuery("issues") }));
vi.mock("@/lib/server/project-content", () => ({ decodeProjectName: async () => "Project" }));
vi.mock("@/lib/server/smart-fill", () => ({ runSmartFill }));
vi.mock("@/lib/server/update-issue", () => ({ updateIssueFields }));
vi.mock("@/lib/server/set-issue-categories", () => ({ setIssueCategories }));

const { reevaluationChanges, runDueSmartFillReevaluations } = await import(
  "@/lib/server/smart-fill-reevaluation"
);

const ALL = new Set(["priority", "effort", "category_ids", "objective_id"]);
const state = {
  priority: "medium",
  effort: "s",
  objective_id: "objective-a",
  category_ids: ["category-a"],
};

describe("reevaluationChanges", () => {
  it("writes only owned fields whose value differs", () => {
    expect(
      reevaluationChanges(state, new Set(["priority", "effort"]), {
        priority: "high",
        effort: "s",
        objective_id: "objective-b",
        category_ids: ["category-b"],
      }),
    ).toEqual({ fields: { priority: "high" }, categoryIds: null });
  });

  it("may clear an owned effort, never an objective or the categories", () => {
    expect(reevaluationChanges(state, ALL, { effort: null, category_ids: [] })).toEqual({
      fields: { effort: null },
      categoryIds: null,
    });
  });

  it("replaces the category set only when it differs", () => {
    expect(reevaluationChanges(state, ALL, { category_ids: ["category-a"] }).categoryIds).toBeNull();
    expect(reevaluationChanges(state, ALL, { category_ids: ["category-a", "category-b"] }).categoryIds)
      .toEqual(["category-a", "category-b"]);
  });

  it("changes nothing on an empty answer", () => {
    expect(reevaluationChanges(state, ALL, {})).toEqual({ fields: {}, categoryIds: null });
  });
});

describe("runDueSmartFillReevaluations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorMeta = {};
    categories = ["category-a"];
    issue = {
      id: "issue-1",
      project_id: "project-1",
      title: "Title",
      description: "Now a much larger piece of work",
      priority: "medium",
      effort: "s",
      objective_id: null,
      updated_at: "2026-10-21T10:00:00+00:00",
      deleted_at: null,
    };
    queue = [
      {
        issue_id: "issue-1",
        project_id: "project-1",
        fields: ["priority", "effort", "category_ids"],
        reevaluate_at: new Date(Date.now() - 1000).toISOString(),
        reevaluate_by: "editor-1",
      },
    ];
    updateIssueFields.mockResolvedValue({ ok: true });
    setIssueCategories.mockResolvedValue({ ok: true, categoryIds: [] });
  });

  it("applies the new answer as the editor, through the Smart Fill write paths", async () => {
    runSmartFill.mockResolvedValue({ priority: "high", effort: "l", category_ids: ["category-b"] });

    const result = await runDueSmartFillReevaluations();

    expect(result).toEqual({ due: 1, outcomes: { applied: 1 } });
    expect(queue[0].reevaluate_at).toBeNull();
    expect(runSmartFill).toHaveBeenCalledWith(expect.objectContaining({
      billToUserId: "editor-1",
      description: "Now a much larger piece of work",
    }));
    expect(updateIssueFields).toHaveBeenCalledWith({
      issueId: "issue-1",
      actorId: "editor-1",
      input: { priority: "high", effort: "l" },
      viaSmartFill: true,
      expectedUpdatedAt: "2026-10-21T10:00:00+00:00",
    });
    expect(setIssueCategories).toHaveBeenCalledWith({
      issueId: "issue-1",
      actorId: "editor-1",
      categoryIds: ["category-b"],
      viaSmartFill: true,
    });
  });

  it("writes nothing when the answer matches the issue", async () => {
    runSmartFill.mockResolvedValue({ priority: "medium", effort: "s", category_ids: ["category-a"] });

    expect((await runDueSmartFillReevaluations()).outcomes).toEqual({ unchanged: 1 });
    expect(updateIssueFields).not.toHaveBeenCalled();
    expect(setIssueCategories).not.toHaveBeenCalled();
  });

  it("does not spend when the editor turned re-evaluation off", async () => {
    editorMeta = { smart_fill_reevaluate: false };

    expect((await runDueSmartFillReevaluations()).outcomes).toEqual({ disabled: 1 });
    expect(runSmartFill).not.toHaveBeenCalled();
    expect(queue[0].reevaluate_at).toBeNull();
  });

  it("leaves passes that are not due yet", async () => {
    queue[0].reevaluate_at = new Date(Date.now() + 60_000).toISOString();

    expect(await runDueSmartFillReevaluations()).toEqual({ due: 0, outcomes: {} });
    expect(runSmartFill).not.toHaveBeenCalled();
  });

  it("runs again when the issue changed while the model answered", async () => {
    runSmartFill.mockResolvedValue({ priority: "high" });
    updateIssueFields.mockResolvedValue({ ok: false, status: 409 });

    expect((await runDueSmartFillReevaluations()).outcomes).toEqual({ requeued: 1 });
    expect(queue[0].reevaluate_at).not.toBeNull();
    expect(setIssueCategories).not.toHaveBeenCalled();
  });

  it("drops a stale category-only answer", async () => {
    runSmartFill.mockImplementation(async () => {
      issue!.updated_at = "2026-10-21T10:01:00+00:00";
      return { category_ids: ["category-b"] };
    });

    expect((await runDueSmartFillReevaluations()).outcomes).toEqual({ requeued: 1 });
    expect(setIssueCategories).not.toHaveBeenCalled();
  });
});
