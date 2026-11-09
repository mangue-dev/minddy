import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeStreaks, heatmapTotals } from "@/lib/stats-derive";
import { getUserStats } from "@/lib/server/stats";
import { getUserUsage, segmentizeUsage } from "@/lib/server/usage";
import { getUsageForecast } from "@/lib/server/usage-analytics";
import type { UsageForecastStatus } from "@/lib/usage-forecast";
import { managedServices } from "@/lib/managed-services";
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
  const activity = heatmapTotals(stats.heatmap.days, stats.heatmap.completed);
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

export interface PlanUsageToolResult {
  plan: {
    planId: string;
    includedUsd: number;
    usedUsd: number;
    remainingUsd: number;
    /** What the user sees: the budget in percent, never in dollars. */
    usedPercent: number;
    remainingPercent: number;
    periodStart: string;
    nextResetAt: string;
  };
  /** Spend per display segment (routines, numo, dictation, feedback, automations). */
  segments: Array<{ id: string; usd: number }>;
  /**
   * Where the budget is heading by the reset at the current pace (MIN-946),
   * the verdict the billing page shows. `null` when it cannot be read.
   */
  forecast: {
    status: UsageForecastStatus;
    /** Percent of the budget used by the reset at this pace. */
    projectedPercent: number;
    /** When the budget runs out, when it does before the reset. */
    runsOutAt: string | null;
    /** Whole days between that run-out and the reset. */
    daysShort: number;
  } | null;
}

const roundPercent = (value: number) => Math.round(value * 10) / 10;

/** Plan consumption of the current billing window, per display segment. */
export async function readPlanUsageTool({
  userId,
}: {
  userId: string;
}): Promise<
  { ok: true; usage: PlanUsageToolResult } | { ok: false; error: string }
> {
  // Same gate as /api/billing/usage (MIN-72): with managed AI off — the
  // normal self-hosted case — there is no Minddy AI allowance and no usage
  // to report, whatever the resolved plan or raw ledger say.
  const ai = managedServices().ai;
  let usage;
  // The forecast is a best-effort extra: the plan numbers stand without it.
  const forecastRead = ai
    ? getUsageForecast(userId).catch(() => null)
    : Promise.resolve(null);
  try {
    usage = await getUserUsage(userId);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const forecast = await forecastRead;
  const { billing, period, usedUsd } = usage;
  const includedUsd = ai ? billing.plan.includedUsageUsd : 0;
  const billedUsd = ai ? usedUsd : 0;
  return {
    ok: true,
    usage: {
      plan: {
        planId: billing.planId,
        includedUsd,
        usedUsd: billedUsd,
        remainingUsd: Math.max(0, includedUsd - billedUsd),
        usedPercent:
          includedUsd > 0 ? roundPercent((billedUsd / includedUsd) * 100) : 0,
        remainingPercent:
          includedUsd > 0
            ? roundPercent(Math.max(0, 100 - (billedUsd / includedUsd) * 100))
            : 0,
        periodStart: period.start,
        nextResetAt: period.end,
      },
      segments: ai
        ? segmentizeUsage(usage.byFeature).filter((segment) => segment.usd > 0)
        : [],
      forecast: forecast
        ? {
            status: forecast.status,
            projectedPercent: roundPercent(forecast.projectedPercent),
            runsOutAt: forecast.runsOutAt,
            daysShort: forecast.daysShort,
          }
        : null,
    },
  };
}
