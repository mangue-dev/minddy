import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Issue } from "@/lib/types";

/** MIN-878 — the project statistics Numo and MCP clients read. */
const mocks = vi.hoisted(() => ({
  issues: { ok: true, data: [] as Issue[] } as { ok: true; data: Issue[] } | { ok: false },
  pullRequests: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/project-working-set-readers", () => ({ loadProjectIssues: async () => mocks.issues }));
vi.mock("@/lib/server/agent/issue-pull-requests", () => ({ listProjectPullRequestTimeline: mocks.pullRequests }));
vi.mock("@/lib/server/issue-reads", () => ({
  listMembers: async () => ({ members: [{ user_id: "u1", name: "Camille Roy", role: "owner" }] }),
}));

import { readProjectStats } from "./project-stats";

const ctx = {
  db: {} as SupabaseClient,
  service: {} as SupabaseClient,
  projectId: "p1",
  projectKey: "MIN",
  actorId: "u1",
};
const now = new Date("2026-10-30T12:00:00Z");

function issue(number: number, overrides: Partial<Issue>): Issue {
  return {
    id: `i${number}`,
    number,
    title: `Issue ${number}`,
    status: "todo",
    assignee_id: null,
    due_date: null,
    created_at: "2026-10-01T12:00:00Z",
    updated_at: "2026-10-29T12:00:00Z",
    completed_at: null,
    ...overrides,
  } as Issue;
}

describe("readProjectStats", () => {
  it("lists the overdue and stalled issues behind the health counts", async () => {
    mocks.issues = {
      ok: true,
      data: [
        issue(1, { due_date: "2026-10-27", assignee_id: "u1" }),
        issue(2, { status: "in_review", updated_at: "2026-10-01T12:00:00Z" }),
        issue(3, { status: "done", assignee_id: "u1", completed_at: "2026-10-28T12:00:00Z" }),
      ],
    };
    mocks.pullRequests.mockResolvedValue([]);

    const result = await readProjectStats(ctx, { ownerId: "u1", timeZone: "Europe/Paris", now });
    if ("error" in result) throw new Error(result.error);
    const stats = result.stats as Record<string, any>;

    expect(stats.as_of).toBe("2026-10-30");
    expect(stats.health).toEqual({ open: 2, overdue: 1, unassigned: 1, stalled: 1 });
    expect(stats.overdue_issues).toEqual([
      expect.objectContaining({ identifier: "MIN-1", title: "Issue 1", days_overdue: 3 }),
    ]);
    expect(stats.stalled_issues).toEqual([expect.objectContaining({ identifier: "MIN-2", status: "in_review" })]);
    expect(stats.contributors).toEqual([
      { user_id: "u1", name: "Camille Roy", completed_last_90_days: 1, open: 1, by_status: { todo: 1, done: 1 } },
    ]);
    expect(stats.pull_requests).toMatchObject({ total: 0, merged: 0 });
  });

  it("still answers when the pull requests cannot be read", async () => {
    mocks.issues = { ok: true, data: [issue(1, {})] };
    mocks.pullRequests.mockRejectedValue(new Error("forge down"));

    const result = await readProjectStats(ctx, { ownerId: "u1", now });
    expect("stats" in result && result.stats.pull_requests).toBeNull();
  });

  it("reports an error when the issues cannot be read", async () => {
    mocks.issues = { ok: false };

    expect(await readProjectStats(ctx, { ownerId: "u1", now })).toEqual({
      error: "The project's issues could not be read.",
    });
  });
});
