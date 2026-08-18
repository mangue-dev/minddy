import { describe, expect, it } from "vitest";
import { getUserStats } from "@/lib/server/stats";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DURATIONS PER EFFORT ARE MEDIANS, ON BOTH SIDES OF THE RPC.
 *
 * The metric lives in two pieces — the SQL function `get_cycle_stats` that calculates it, and the mapping that reads it here — and each is just on its own: a
 * average on the base side remains a perfectly valid average, and a reader of
 * `median_seconds` remains a perfectly valid reader. The fault would only exist
 * BETWEEN the two, and it would not be seen: plausible bars, a
 * labeled “median”, and averages behind it. Hence the two halves tested
 * here, including SQL.
 */

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
        : { data: { totals: {}, per_project: [], days: [] }, error: null },
    from: () => workload,
  } as unknown as SupabaseClient;
}

const call = (byEffort: RawEffort[]) =>
  getUserStats(fakeSupabase(byEffort), { tz: "Europe/Paris", userId: "user-1" });

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
    const stats = await call([{ effort: "m", avg_seconds: 999_999, sample: 9 }]);

    expect(stats.cycles.byEffort).toEqual([]);
  });

  it("garde les moyennes des deux autres mesures, qui n'ont pas cette traîne", async () => {
    const stats = await call([]);

    expect(stats.cycles.avgCompletionOffsetDays).toBe(-1.5);
    expect(stats.cycles.avgIssuesPerCycle).toBe(6);
  });
});

describe("get_cycle_stats (SQL) — l'autre moitié du contrat", () => {
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
