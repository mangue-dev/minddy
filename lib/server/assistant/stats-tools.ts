import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStreaks, heatmapTotals } from "@/lib/stats-derive";
import { getUserStats } from "@/lib/server/stats";
import { getUserUsage, segmentizeUsage } from "@/lib/server/usage";
import type { UserStats } from "@/lib/types";

/**
 * Read-only statistics tools for Numo (MIN-501) — the numbers the Statistics
 * page and the billing usage endpoint already compute, shaped compactly for
 * the model. Strictly read-only: no settings, no budget mutation.
 */

/** Compact, model-facing form of the user's performance statistics. */
export interface UserStatsToolResult {
  /** Calendar window the activity numbers cover (~last 12 months). */
  activityWindow: { start: string; end: string };
  activeDays: number;
  streaks: { current: number; longest: number };
  /** All-time counters — "since signup". */
  totals: {
    created: number;
    completed: number;
    tasksCompleted: number;
    projects: number;
  };
  last7Days: { completed: number; previous7Days: number };
  workload: { assignedOpen: number; inProgress: number };
  medianSecondsByEffort: Array<{
    effort: string;
    medianSeconds: number;
    sample: number;
  }>;
  topProjects: Array<{ name: string; completed: number }>;
  topCategories: Array<{ name: string; completed: number }>;
}

export function userStatsForAssistantTool(
  stats: UserStats,
): UserStatsToolResult {
  const activity = heatmapTotals(stats.heatmap.days);
  return {
    activityWindow: { start: stats.heatmap.start, end: stats.heatmap.end },
    activeDays: activity.activeDays,
    streaks: computeStreaks(stats.heatmap.days),
    totals: {
      created: stats.totals.created,
      completed: stats.totals.completed,
      tasksCompleted: stats.totals.tasksCompleted,
      projects: stats.totals.projects,
    },
    last7Days: {
      completed: stats.week.completed,
      previous7Days: stats.week.previous,
    },
    workload: stats.workload,
    medianSecondsByEffort: stats.cycles.byEffort.map((row) => ({
      effort: row.effort,
      medianSeconds: row.medianSeconds,
      sample: row.sample,
    })),
    topProjects: stats.perProject
      .slice(0, 5)
      .map((project) => ({ name: project.name, completed: project.completed })),
    topCategories: stats.perCategory.slice(0, 5).map((category) => ({
      name: category.name,
      completed: category.completed,
    })),
  };
}

/** Reads the user's performance statistics through their RLS client. */
export async function readUserStatsTool({
  userId,
  supabase,
  timezone,
}: {
  userId: string;
  supabase: SupabaseClient;
  timezone?: string;
}): Promise<
  { ok: true; stats: UserStatsToolResult } | { ok: false; error: string }
> {
  try {
    const stats = await getUserStats(supabase, {
      tz: timezone || "UTC",
      userId,
    });
    return { ok: true, stats: userStatsForAssistantTool(stats) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export interface PlanUsageRunRow {
  /** Routine passage vs standalone agent/Numo conversation. */
  kind: "agent" | "routine";
  status: string;
  title: string | null;
  issueNumber: number | null;
  projectKey: string | null;
  costUsd: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface PlanUsageToolResult {
  plan: {
    planId: string;
    includedUsd: number;
    usedUsd: number;
    remainingUsd: number;
    periodStart: string;
    nextResetAt: string;
  };
  /** Spend per display segment (agents, routines, numo, dictation, feedback, automations). */
  segments: Array<{ id: string; usd: number }>;
  /** Newest executions first — agent conversations and routine passages. */
  recentRuns: PlanUsageRunRow[];
}

interface RawRunRow {
  id: string;
  status: string;
  routine_id: string | null;
  title: string | null;
  created_at: string;
  completed_at: string | null;
  cost_usd: number | string | null;
  issue: { number: number } | null;
  project: { key: string } | null;
}

const RECENT_RUNS_LIMIT = 10;

/**
 * Plan consumption + a summary of the most recent executions, through the
 * user's RLS client (agent_runs visibility = project access). Both halves
 * are best-effort: a failure in one must not erase the other.
 */
export async function readPlanUsageTool({
  userId,
  supabase,
}: {
  userId: string;
  supabase: SupabaseClient;
}): Promise<
  { ok: true; usage: PlanUsageToolResult } | { ok: false; error: string }
> {
  const [usageRes, runsRes] = await Promise.allSettled([
    getUserUsage(userId),
    supabase
      .from("agent_runs")
      .select(
        "id, status, routine_id, title, created_at, completed_at, cost_usd, issue:issues(number), project:projects(key)",
      )
      // Routine passages and Numo-owned workers only, like the Agents page:
      // delegated workers are mediated in their parent conversation.
      .is("parent_numo_turn_id", null)
      .order("created_at", { ascending: false })
      .limit(RECENT_RUNS_LIMIT),
  ]);

  if (usageRes.status === "rejected" && runsRes.status === "rejected") {
    const reason =
      usageRes.reason instanceof Error ? usageRes.reason.message : "unknown";
    return { ok: false, error: reason };
  }

  const usage: Partial<PlanUsageToolResult> = {};
  if (usageRes.status === "fulfilled") {
    const { billing, period, usedUsd } = usageRes.value;
    const includedUsd = billing.plan.includedUsageUsd;
    usage.plan = {
      planId: billing.planId,
      includedUsd,
      usedUsd,
      remainingUsd: Math.max(0, includedUsd - usedUsd),
      periodStart: period.start,
      nextResetAt: period.end,
    };
    usage.segments = segmentizeUsage(usageRes.value.byFeature).filter(
      (segment) => segment.usd > 0,
    );
  }

  if (runsRes.status === "fulfilled" && !runsRes.value.error) {
    usage.recentRuns = (
      (runsRes.value.data ?? []) as unknown as RawRunRow[]
    ).map((row) => ({
      kind: row.routine_id ? "routine" : "agent",
      status: row.status,
      title: row.title,
      issueNumber: row.issue?.number ?? null,
      projectKey: row.project?.key ?? null,
      costUsd:
        row.cost_usd === null || row.cost_usd === undefined
          ? null
          : Number(row.cost_usd),
      startedAt: row.created_at,
      completedAt: row.completed_at,
    }));
  }

  if (!usage.plan && !usage.recentRuns) {
    const error =
      runsRes.status === "fulfilled" && runsRes.value.error
        ? runsRes.value.error.message
        : "Plan usage unavailable";
    return { ok: false, error };
  }

  return { ok: true, usage: usage as PlanUsageToolResult };
}
