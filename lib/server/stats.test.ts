import { describe, expect, it } from "vitest";
import { getUserStats } from "@/lib/server/stats";
import {
  canonicalSql,
  readBaseline,
  readMigration,
} from "@/test/sql-migrations";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Durations by effort must be medians on both sides of the RPC contract. */

/** Raw output of the RPC cycles, with only the keys that the mapping reads. */
type RawEffort = Record<string, unknown>;

function fakeSupabase(byEffort: RawEffort[]) {
  const cycleStats = {
    avg_completion_offset_days: -1.5,
    completion_offset_sample: 4,
    avg_issues_per_cycle: 6,
    cycle_count: 2,
    by_effort: byEffort,
  };
  // The “current load” query: chainable, and thenable at the end since
  // getUserStats expects it directly in its Promise.all.
  const workload = {
    select: () => workload,
    is: () => workload,
    eq: () => workload,
    not: () => workload,
    then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return {
    rpc: async (name: string) =>
      name === "get_cycle_stats"
        ? { data: cycleStats, error: null }
        : {
            data: {
              totals: {},
              breakdown_total: 3,
              per_project: [
                {
                  id: "project-1",
                  name: "minddy",
                  color: "#8b5cf6",
                  icon_url: null,
                  orb_seed: "orb-1",
                  completed: 3,
                },
              ],
              per_category: [
                {
                  id: "category-1",
                  project_id: "project-1",
                  name: "Design",
                  color: "#f59e0b",
                  completed: 2,
                },
                {
                  id: "category-2",
                  project_id: "project-2",
                  name: "Design",
                  color: "#f59e0b",
                  completed: 1,
                },
              ],
              per_objective: [
                {
                  id: "objective-1",
                  project_id: "project-1",
                  name: "Launch",
                  color: "#ec4899",
                  completed: 3,
                },
              ],
              days: [],
            },
            error: null,
          },
    from: () => workload,
  } as unknown as SupabaseClient;
}

const call = (byEffort: RawEffort[]) =>
  getUserStats(fakeSupabase(byEffort), {
    tz: "Europe/Paris",
    userId: "user-1",
  });

describe("getUserStats — durations by effort", () => {
  it("reads RPC medians in xs→xl order", async () => {
    const stats = await call([
      { effort: "l", median_seconds: "172800", sample: 3 },
      { effort: "xs", median_seconds: 1800, sample: 12 },
      { effort: "m", median_seconds: 43200, sample: 7 },
    ]);

    expect(stats.cycles.byEffort).toEqual([
      { effort: "xs", medianSeconds: 1800, sample: 12 },
      { effort: "m", medianSeconds: 43200, sample: 7 },
      { effort: "l", medianSeconds: 172800, sample: 3 },
    ]);
  });

  it("discards an effort with no sample", async () => {
    const stats = await call([
      { effort: "s", median_seconds: 0, sample: 0 },
      { effort: "m", median_seconds: 3600, sample: 1 },
    ]);

    expect(stats.cycles.byEffort.map((e) => e.effort)).toEqual(["m"]);
  });

  it("does not fall back to the old average when the migration has not run", async () => {
    // Function before migration: it only returns `avg_seconds`. Display
    // this value under the label “median” would be a false and silent figure;
    // the section is erased while the base catches up with the code.
    const stats = await call([
      { effort: "m", avg_seconds: 999_999, sample: 9 },
    ]);

    expect(stats.cycles.byEffort).toEqual([]);
  });

  it("keeps averages for the other two measures, which do not have that long tail", async () => {
    const stats = await call([]);

    expect(stats.cycles.avgCompletionOffsetDays).toBe(-1.5);
    expect(stats.cycles.avgIssuesPerCycle).toBe(6);
  });
});

describe("getUserStats — work landscape", () => {
  it("maps project artwork, categories, objectives, and their shared total", async () => {
    const stats = await call([]);

    expect(stats.breakdownTotal).toBe(3);
    expect(stats.perProject).toEqual([
      {
        id: "project-1",
        name: "minddy",
        color: "#8b5cf6",
        iconUrl: null,
        orbSeed: "orb-1",
        completed: 3,
      },
    ]);
    expect(stats.perCategory).toEqual([
      { name: "Design", color: "#f59e0b", completed: 3 },
    ]);
    expect(stats.perObjective[0]).toMatchObject({
      id: "objective-1",
      projectId: "project-1",
      completed: 3,
    });
  });
});

describe("get_cycle_stats (SQL) — the other half of the contract", () => {
  const sql = canonicalSql(readBaseline());

  it("aggregates durations with percentile_cont(0.5), not avg", () => {
    expect(sql).toContain("percentile_cont(0.5) within group (order by secs)");
    expect(sql).not.toContain("avg(secs)");
  });

  it("exposes the median_seconds key read by the mapping", () => {
    expect(sql).toContain("'median_seconds'");
    expect(sql).not.toContain("'avg_seconds'");
  });
});

describe("get_user_stats (SQL) — current named breakdowns", () => {
  const sql = canonicalSql(
    readMigration("20270106250000_stats_story_breakdowns.sql"),
  );

  it("filters current breakdowns through live projects and live issues", () => {
    expect(sql).toContain("where deleted_at is null");
    expect(sql).toContain("and i.deleted_at is null");
    expect(sql).toContain("join active_projects p on p.id = i.project_id");
  });

  it("also removes deleted projects from live cycle and duration metrics", () => {
    expect(sql).toContain("create or replace function public.get_cycle_stats");
    expect(sql).toContain("count(p.id) as n");
    expect(sql.match(/p\.deleted_at is null/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
  });

  it("returns project, category, and objective buckets on one total", () => {
    expect(sql).toContain("'breakdown_total'");
    expect(sql).toContain("'per_project'");
    expect(sql).toContain("'per_category'");
    expect(sql).toContain("'per_objective'");
  });

  it("deduplicates categories by their visible name and color", () => {
    expect(sql).toContain("group by c.name, c.color");
    expect(sql).not.toContain("group by c.id, c.project_id, c.name, c.color");
  });
});
