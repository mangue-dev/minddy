import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Isolated items (MIN-932): forgotten issues from the working set, and pages
 * tied to no issue (neither citing one nor cited by one), as short lists.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  issues: [] as Array<Record<string, unknown>>,
  pages: [] as Array<Record<string, unknown>>,
  reads: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/server/project-working-set-readers", () => ({
  loadProjectIssues: async () => ({ ok: true, data: mocks.issues }),
}));
vi.mock("@/lib/server/page-tools", () => ({
  listPagesForAgent: async () => ({ ok: true, data: { pages: mocks.pages } }),
  readPageForAgent: async ({ pageId }: { pageId: string }) => {
    const read = mocks.reads.get(pageId);
    return read ? { ok: true, data: read } : { ok: false };
  },
}));

import { findIsolatedItems, pageHasIssue } from "./isolated-items";

const NOW = new Date("2026-10-30T12:00:00Z");
const LONG = "We still need to fix the login redirect after a password reset. ".repeat(3);
const ctx = { db: {} as never, service: {} as never, projectId: "p1", projectKey: "MIN", actorId: "u1" };

function page(id: string, markdown: string, backlinks: Array<{ kind: string }> = [], extra = {}) {
  mocks.pages.push({ page_id: id, title: `Page ${id}`, updated_at: "2026-10-20T00:00:00Z", ...extra });
  mocks.reads.set(id, { page_id: id, title: `Page ${id}`, updated_at: "2026-10-20T00:00:00Z",
    is_database: false, markdown, backlinks });
}

describe("findIsolatedItems", () => {
  beforeEach(() => {
    mocks.issues = Array.from({ length: 10 }, (_, index) => ({
      id: `i${index}`, number: index + 1, title: `Issue ${index}`, status: "todo",
      assignee_id: null, due_date: null, created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-10-28T00:00:00Z", completed_at: null,
    }));
    mocks.pages = [];
    mocks.reads = new Map();
  });

  it("lists forgotten issues with their identifier and idle days", async () => {
    mocks.issues.push({ id: "old", number: 42, title: "Old", status: "in_progress", assignee_id: "u2",
      due_date: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-09-10T12:00:00Z", completed_at: null });
    const result = await findIsolatedItems(ctx, { now: NOW });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.forgotten_issues).toEqual([expect.objectContaining({
      id: "old", identifier: "MIN-42", status: "in_progress", idle_days: 50,
    })]);
  });

  it("keeps only pages tied to no issue, with enough text, and skips databases", async () => {
    page("lonely", LONG);
    page("cites", `${LONG} See [@](mention:issue/i1).`);
    page("cited", LONG, [{ kind: "issue" }]);
    page("short", "A few words.");
    page("db", LONG, [], { database_schema: [{ id: "c1" }] });
    const result = await findIsolatedItems(ctx, { now: NOW });
    if ("error" in result) throw new Error(result.error);
    expect(result.pages_without_issue.map((item) => item.page_id)).toEqual(["lonely"]);
    expect(result.pages_without_issue[0].excerpt.length).toBeLessThanOrEqual(400);
  });
});

describe("pageHasIssue", () => {
  it("counts a page another record cites only when that record is an issue", () => {
    expect(pageHasIssue("text", [{ kind: "page" }, { kind: "objective" }])).toBe(false);
    expect(pageHasIssue("text", [{ kind: "issue" }])).toBe(true);
    expect(pageHasIssue("Fix [@](mention:issue/i1)", [])).toBe(true);
  });
});
