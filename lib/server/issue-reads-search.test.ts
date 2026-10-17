import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hybrid `searchIssues` (MIN-718), the MCP and Numo search: text matches and
 * exact identifiers first, issues found by meaning appended and marked.
 */

const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  semantic: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/issue-semantic-search", () => ({ searchIssuesSemantically: h.semantic }));
vi.mock("@/lib/server/issue-store", async (original) => ({
  ...(await original<typeof import("@/lib/server/issue-store")>()),
  decodeIssue: async (row: Record<string, unknown>) => row,
}));

const { searchIssues } = await import("./issue-reads");

function db() {
  return {
    from: () => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let window: [number, number] | null = null;
      const run = () => {
        const rows = h.rows.filter((row) => filters.every((f) => f(row)));
        return window ? rows.slice(window[0], window[1] + 1) : rows;
      };
      const q = {
        select: () => q,
        is(c: string, v: unknown) { filters.push((r) => (r[c] ?? null) === v); return q; },
        eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return q; },
        in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return q; },
        order: () => q,
        range(a: number, b: number) { window = [a, b]; return q; },
        async maybeSingle() { return { data: run()[0] ?? null, error: null }; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: run(), error: null }).then(resolve); },
      };
      return q;
    },
  };
}

const issue = (id: string, number: number, title: string, extra: Record<string, unknown> = {}) => ({
  id, number, title, description: null, status: "todo", priority: "none", effort: null, assignee_id: null,
  objective_id: null, due_date: null, recurrence: null, parent_id: null, project_id: "p1", deleted_at: null,
  issue_categories: [], ...extra,
});

const ctx = () => ({ db: db() as never, service: {} as never, projectId: "p1", projectKey: "MIN", actorId: "u1" });

beforeEach(() => {
  h.rows = [
    issue("a", 1, "Single sign-on login"),
    issue("b", 2, "Enterprise identity federation"),
    issue("c", 3, "Trashed SSO work", { deleted_at: "2026-10-01" }),
    issue("d", 4, "Other project", { project_id: "p2" }),
  ];
  h.semantic.mockReset().mockResolvedValue({
    status: "ok",
    hits: [{ id: "a", project_id: "p1", score: 0.9 }, { id: "b", project_id: "p1", score: 0.7 },
      { id: "c", project_id: "p1", score: 0.6 }, { id: "d", project_id: "p2", score: 0.5 }],
  });
});

describe("searchIssues (hybrid)", () => {
  it("keeps text matches first and appends meaning matches from the same project, marked", async () => {
    const result = await searchIssues(ctx(), { query: "single sign-on" });
    expect("issues" in result && result.issues.map((i) => [i.id, i.match ?? "text"])).toEqual([
      ["a", "text"],
      ["b", "semantic"],
    ]);
    expect(h.semantic).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", projectIds: ["p1"] }));
  });

  it("answers an exact identifier alone, without a semantic search", async () => {
    const result = await searchIssues(ctx(), { query: "MIN-2" });
    expect("issues" in result && result.issues.map((i) => i.id)).toEqual(["b"]);
    expect(h.semantic).not.toHaveBeenCalled();
  });

  it("does not search by meaning without an actor to bill", async () => {
    await searchIssues({ ...ctx(), actorId: undefined }, { query: "single sign-on" });
    expect(h.semantic).not.toHaveBeenCalled();
  });
});
