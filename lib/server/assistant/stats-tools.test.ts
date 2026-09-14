import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_TOOLS } from "./tools";
import {
  readPlanUsageTool,
  readUserStatsTool,
  userStatsForAssistantTool,
} from "./stats-tools";
import type { UserStats } from "@/lib/types";

/** MIN-501 — Numo reads the user's statistics, read-only. */
vi.mock("@/lib/server/usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/usage")>();
  return {
    ...actual,
    getUserUsage: vi.fn(),
  };
});

vi.mock("@/lib/managed-services", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/managed-services")>();
  return {
    ...actual,
    managedServices: vi.fn(actual.managedServices),
  };
});

import { getUserUsage } from "@/lib/server/usage";
import { managedServices } from "@/lib/managed-services";

const statsFixture: UserStats = {
  totals: {
    created: 150,
    completed: 120,
    projects: 3,
    tasksCompleted: 30,
  },
  breakdownTotal: 120,
  perProject: [
    {
      id: "p1",
      name: "minddy",
      color: null,
      iconUrl: null,
      orbSeed: null,
      completed: 80,
    },
    {
      id: "p2",
      name: "side",
      color: null,
      iconUrl: null,
      orbSeed: null,
      completed: 40,
    },
  ],
  perCategory: [
    { name: "Design", color: "#f59e0b", completed: 40 },
    { name: "Code", color: "#8b5cf6", completed: 30 },
  ],
  perObjective: [],
  heatmap: {
    tz: "Europe/Paris",
    start: "2025-09-07",
    end: "2026-09-13",
    max: 5,
    days: [
      { date: "2026-09-07", count: 2, issues: 1, tasks: 1 },
      { date: "2026-09-08", count: 0, issues: 0, tasks: 0 },
      { date: "2026-09-09", count: 3, issues: 2, tasks: 1 },
      { date: "2026-09-10", count: 1, issues: 1, tasks: 0 },
      { date: "2026-09-11", count: 0, issues: 0, tasks: 0 },
      { date: "2026-09-12", count: 0, issues: 0, tasks: 0 },
      { date: "2026-09-13", count: 2, issues: 2, tasks: 0 },
    ],
  },
  workload: { assignedOpen: 12, inProgress: 3 },
  week: { completed: 8, issues: 6, tasks: 2, previous: 5 },
  cycles: {
    avgCompletionOffsetDays: null,
    completionOffsetSample: 0,
    avgIssuesPerCycle: null,
    cycleCount: 0,
    byEffort: [
      { effort: "xs", medianSeconds: 1800, sample: 12 },
      { effort: "m", medianSeconds: 43200, sample: 7 },
    ],
  },
};

describe("userStatsForAssistantTool", () => {
  it("counts active days and streaks from the heatmap window", () => {
    const result = userStatsForAssistantTool(statsFixture);

    expect(result.activeDays).toBe(4);
    expect(result.streaks).toEqual({ current: 1, longest: 2 });
    expect(result.activityWindow).toEqual({
      start: "2025-09-07",
      end: "2026-09-13",
    });
  });

  it("keeps all-time totals (since signup), momentum, workload, medians by effort and top buckets", () => {
    const result = userStatsForAssistantTool(statsFixture);

    expect(result.totals).toEqual({
      created: 150,
      completed: 120,
      tasksCompleted: 30,
      projects: 3,
    });
    expect(result.last7Days).toEqual({ completed: 8, previous7Days: 5 });
    expect(result.workload).toEqual({ assignedOpen: 12, inProgress: 3 });
    expect(result.medianSecondsByEffort).toEqual([
      { effort: "xs", medianSeconds: 1800, sample: 12 },
      { effort: "m", medianSeconds: 43200, sample: 7 },
    ]);
    expect(result.topProjects).toEqual([
      { name: "minddy", completed: 80 },
      { name: "side", completed: 40 },
    ]);
    expect(result.topCategories).toEqual([
      { name: "Design", completed: 40 },
      { name: "Code", completed: 30 },
    ]);
  });
});

describe("readUserStatsTool", () => {
  /** The "current load" query: chainable, then thenable at the end. */
  function workload() {
    const query = {
      select: () => query,
      is: () => query,
      eq: () => query,
      not: () => query,
      then: (resolve: (r: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return query;
  }

  it("passes the user's RLS client and timezone to getUserStats", async () => {
    const supabase = {
      rpc: vi.fn(async (name: string) => {
        if (name === "get_cycle_stats") {
          return { data: null, error: { message: "not deployed" } };
        }
        return {
          data: {
            totals: {
              created: 1,
              completed: 1,
              projects: 1,
              tasks_completed: 0,
            },
            breakdown_total: 1,
            per_project: [],
            per_category: [],
            per_objective: [],
            days: [],
          },
          error: null,
        };
      }),
      from: vi.fn(() => workload()),
    } as unknown as SupabaseClient;

    const result = await readUserStatsTool({
      userId: "user-1",
      supabase,
      timezone: "Europe/Paris",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.stats.totals.completed).toBe(1);
    }
    expect(supabase.rpc).toHaveBeenCalledWith("get_user_stats", {
      p_tz: "Europe/Paris",
      p_since: expect.any(String),
    });
  });

  it("maps a stats failure to a tool error", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })),
      from: vi.fn(() => workload()),
    } as unknown as SupabaseClient;

    const result = await readUserStatsTool({
      userId: "user-1",
      supabase,
      timezone: "UTC",
    });

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("readPlanUsageTool", () => {
  function fakeSupabase(
    runs: unknown[] | null,
    error: { message: string } | null,
  ) {
    const query = {
      select: () => query,
      is: () => query,
      eq: vi.fn(() => query),
      order: () => query,
      limit: () => Promise.resolve({ data: runs, error }),
    };
    return { from: vi.fn(() => query) } as unknown as SupabaseClient;
  }

  it("returns plan budget, spend segments and recent runs", async () => {
    vi.mocked(managedServices).mockReturnValue({
      billing: true,
      ai: true,
      forge: true,
    });
    vi.mocked(getUserUsage).mockResolvedValue({
      billing: {
        planId: "free",
        plan: { includedUsageUsd: 5 },
        source: "default",
        account: null,
        stripeConfigured: false,
      },
      period: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
      },
      usedUsd: 1.5,
      byFeature: { agent_code: 1, routine_code: 0.5 },
    } as Awaited<ReturnType<typeof getUserUsage>>);

    const result = await readPlanUsageTool({
      userId: "user-1",
      supabase: fakeSupabase(
        [
          {
            id: "run-1",
            status: "completed",
            routine_id: null,
            title: "Fix the login bug",
            created_at: "2026-09-13T10:00:00Z",
            completed_at: "2026-09-13T10:05:00Z",
            cost_usd: "0.250000",
            issue: { number: 42 },
            project: { key: "MDY" },
          },
          {
            id: "run-2",
            status: "failed",
            routine_id: "routine-1",
            title: null,
            created_at: "2026-09-12T08:00:00Z",
            completed_at: "2026-09-12T08:02:00Z",
            cost_usd: null,
            issue: null,
            project: null,
          },
        ],
        null,
      ),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usage.plan).toEqual({
      planId: "free",
      includedUsd: 5,
      usedUsd: 1.5,
      remainingUsd: 3.5,
      periodStart: "2026-09-01T00:00:00.000Z",
      nextResetAt: "2026-10-01T00:00:00.000Z",
    });
    expect(result.usage.segments).toEqual([
      { id: "agents", usd: 1 },
      { id: "routines", usd: 0.5 },
    ]);
    expect(result.usage.recentRuns).toEqual([
      {
        kind: "agent",
        status: "completed",
        title: "Fix the login bug",
        issueNumber: 42,
        projectKey: "MDY",
        costUsd: 0.25,
        startedAt: "2026-09-13T10:00:00Z",
        completedAt: "2026-09-13T10:05:00Z",
      },
      {
        kind: "routine",
        status: "failed",
        title: null,
        issueNumber: null,
        projectKey: null,
        costUsd: null,
        startedAt: "2026-09-12T08:00:00Z",
        completedAt: "2026-09-12T08:02:00Z",
      },
    ]);
    // Teammates' project-visible runs must not leak into this user's
    // execution summary (agent_runs_select is project-wide).
    const query = fakeSupabase([], null);
    await readPlanUsageTool({ userId: "user-9", supabase: query });
    const runQuery = (query.from as ReturnType<typeof vi.fn>).mock.results[0]
      .value as Record<string, ReturnType<typeof vi.fn>>;
    expect(runQuery.eq).toHaveBeenCalledWith("created_by", "user-9");
  });

  it("reports zero usage and no segments when managed AI is off", async () => {
    vi.mocked(getUserUsage).mockResolvedValue({
      billing: {
        planId: "free",
        plan: { includedUsageUsd: 5 },
        source: "default",
        account: null,
        stripeConfigured: false,
      },
      period: {
        start: "2026-09-01T00:00:00.000Z",
        end: "2026-10-01T00:00:00.000Z",
      },
      usedUsd: 1.5,
      byFeature: { agent_code: 1.5 },
    } as Awaited<ReturnType<typeof getUserUsage>>);
    vi.mocked(managedServices).mockReturnValue({
      billing: true,
      ai: false,
      forge: true,
    });

    const result = await readPlanUsageTool({
      userId: "user-1",
      supabase: fakeSupabase([], null),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usage.plan).toEqual({
      planId: "free",
      includedUsd: 0,
      usedUsd: 0,
      remainingUsd: 0,
      periodStart: "2026-09-01T00:00:00.000Z",
      nextResetAt: "2026-10-01T00:00:00.000Z",
    });
    expect(result.usage.segments).toEqual([]);
  });

  it("still answers when only one of the two halves fails", async () => {
    vi.mocked(getUserUsage).mockRejectedValue(new Error("usage rpc missing"));

    const result = await readPlanUsageTool({
      userId: "user-1",
      supabase: fakeSupabase([], null),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usage.plan).toBeUndefined();
    expect(result.usage.recentRuns).toEqual([]);
  });

  it("fails when both halves fail", async () => {
    vi.mocked(getUserUsage).mockRejectedValue(new Error("usage rpc missing"));

    const result = await readPlanUsageTool({
      userId: "user-1",
      supabase: fakeSupabase(null, { message: "rls denied" }),
    });

    expect(result.ok).toBe(false);
  });
});

describe("stats tools — registration contract", () => {
  it("registers both tools as account-scoped (no injected project_id)", () => {
    expect(ACCOUNT_TOOLS.has("get_user_stats")).toBe(true);
    expect(ACCOUNT_TOOLS.has("get_plan_usage")).toBe(true);
  });
});
