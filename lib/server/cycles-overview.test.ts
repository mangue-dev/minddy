import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { CyclePrefs } from "@/lib/cycle-prefs";

vi.mock("@/lib/server/issue-events", () => ({ insertEvents: vi.fn() }));

const { fillCycleForUser, getCycleOverview } = await import("./cycles");

const prefs: CyclePrefs = {
  enabled: true,
  durationWeeks: 1,
  startDow: 1,
  intensity: "medium",
  upcomingCount: 1,
  autoCaptureStarted: true,
  autoCaptureCompleted: true,
};
const current = {
  id: "current",
  user_id: "user",
  start_date: "2026-09-14",
  end_date: "2026-09-21",
  intensity: "medium" as const,
  target_points: 80,
  completed_points: null,
  filled_at: "2026-09-14T00:00:00Z",
};

type Row = Record<string, unknown>;

function makeService(status: string, deletedAt: string | null = null) {
  const db: Record<string, Row[]> = {
    cycles: [current, {
      ...current,
      id: "next",
      start_date: "2026-09-21",
      end_date: "2026-09-28",
    }],
    issues: [
      {
        id: "b", project_id: "project", number: 2, title: "Candidate B",
        status: "todo", priority: "medium", effort: "s", objective_id: "o",
        assignee_id: "user", cycle_id: null, deleted_at: null,
        issue_categories: [], projects: { key: "MIN", deleted_at: null },
        "projects.deleted_at": null,
      },
      {
        id: "a", status, assignee_id: "another-user", cycle_id: null,
        deleted_at: deletedAt,
      },
    ],
    objectives: [{ id: "o", status: "in_progress", deleted_at: null }],
    issue_relations: [{
      id: "a-blocks-o", source_id: "a", source_type: "issue",
      target_id: "o", target_type: "objective", type: "blocks",
    }],
  };
  const queries: Array<{ table: string; columns: string; ids: unknown[] }> = [];
  const service = {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const query = { table, columns: "", ids: [] as unknown[] };
      queries.push(query);
      const chain = {
        select(columns: string) { query.columns = columns; return chain; },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        is(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return chain;
        },
        in(column: string, values: unknown[]) {
          if (column === "id") query.ids = values;
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        order() { return chain; },
        limit() { return chain; },
        then(resolve: (result: { data: Row[]; error: null }) => unknown) {
          return resolve({
            data: db[table].filter((row) => filters.every((filter) => filter(row))),
            error: null,
          });
        },
      };
      return chain;
    },
  };
  return { service: service as unknown as SupabaseClient, queries, db };
}

describe("getCycleOverview external objective blockers (MIN-513)", () => {
  it("reports B blocked when external open issue A blocks B's objective, matching fill", async () => {
    const { service, queries } = makeService("in_progress");
    expect(await fillCycleForUser({
      service, userId: "user", actorId: null, cycle: current,
    })).toEqual({ pickedIds: [], points: 0 });
    queries.length = 0;

    const result = await getCycleOverview({ service, userId: "user", prefs, today: "2026-09-16" });
    expect(result).toMatchObject({
      ok: true,
      overview: { candidates: [{ id: "b", blocked: true }] },
    });
    expect(queries.filter((q) => q.table === "issues" && q.columns === "id, status"))
      .toEqual([{ table: "issues", columns: "id, status", ids: ["a"] }]);
  });

  it.each(["done", "canceled", "duplicate"])("does not block B when external A is %s", async (status) => {
    const { service } = makeService(status);
    expect(await getCycleOverview({ service, userId: "user", prefs, today: "2026-09-16" }))
      .toMatchObject({ ok: true, overview: { candidates: [{ id: "b", blocked: false }] } });
  });

  it("does not block B when external A is trashed", async () => {
    const { service } = makeService("in_progress", "2026-09-15T00:00:00Z");
    expect(await getCycleOverview({ service, userId: "user", prefs, today: "2026-09-16" }))
      .toMatchObject({ ok: true, overview: { candidates: [{ id: "b", blocked: false }] } });
  });

  it("does not query external statuses when there are no blockers", async () => {
    const { service, queries, db } = makeService("in_progress");
    db.issue_relations = [];
    expect(await getCycleOverview({ service, userId: "user", prefs, today: "2026-09-16" }))
      .toMatchObject({ ok: true, overview: { candidates: [{ id: "b", blocked: false }] } });
    expect(queries.filter((q) => q.table === "issues" && q.columns === "id, status")).toEqual([]);
  });
});
