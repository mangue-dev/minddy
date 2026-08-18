import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_STATUSES } from "@/lib/server/issue-reads";
import { EFFORTS } from "@/lib/issue-constants";
import type {
  HeatmapDay,
  StatsCycleEffort,
  StatsCycles,
  StatsWeek,
  StatsWorkload,
  UserStats,
} from "@/lib/types";

/** Raw form returned by the get_user_stats SQL function. */
interface RawStats {
  totals: {
    created: number;
    completed: number;
    projects: number;
    tasks_completed: number;
  };
  per_project: Array<{
    name: string | null;
    color: string | null;
    deleted: boolean;
    created: number;
    completed: number;
  }>;
  days: Array<{ date: string; count: number; issues: number; tasks: number }>;
}

/** Raw form returned by the SQL function get_cycle_stats (MIN-58). */
interface RawCycleStats {
  avg_completion_offset_days: number | null;
  completion_offset_sample: number | null;
  avg_issues_per_cycle: number | null;
  cycle_count: number | null;
  by_effort: Array<{
    effort: StatsCycleEffort["effort"];
    median_seconds: number | null;
    sample: number | null;
  }>;
}

/** Effort display order (xs→xl) — indexes the sorting of raw by_effort. */
const EFFORT_ORDER = new Map(EFFORTS.map((e, i) => [e.value, i] as const));

/** Finite number or null (RPC returns Postgres numerics = string|number). */
function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Maps the raw output of the RPC cycles to the client form (MIN-58).
 *
 * `median_seconds` is read without fallback to the old `avg_seconds`: between the
 * deployment of the code and that of the migration, the base function renders again
 * averages, and an average displayed under a “median” label would be a
 * false figure which cannot be seen. A line without a median is therefore discarded — the
 * section disappears while the migration passes, such as when the RPC itself
 * is not yet deployed.
 */
function toCycles(raw: RawCycleStats | null): StatsCycles {
  const byEffort = (raw?.by_effort ?? [])
    .flatMap<StatsCycleEffort>((r) => {
      const medianSeconds = num(r.median_seconds);
      const sample = num(r.sample) ?? 0;
      if (medianSeconds === null || sample <= 0 || !EFFORT_ORDER.has(r.effort)) return [];
      return [{ effort: r.effort, medianSeconds, sample }];
    })
    .sort((a, b) => (EFFORT_ORDER.get(a.effort)! - EFFORT_ORDER.get(b.effort)!));
  return {
    avgCompletionOffsetDays: num(raw?.avg_completion_offset_days),
    completionOffsetSample: num(raw?.completion_offset_sample) ?? 0,
    avgIssuesPerCycle: num(raw?.avg_issues_per_cycle),
    cycleCount: num(raw?.cycle_count) ?? 0,
    byEffort,
  };
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD d'un Date pris comme minuit UTC (dates « nues », sans fuseau). */
function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Heatmap window in the `tz` zone, without date lib:
 * - `end` = today (user's local date);
 * - `start` = Sunday of the 53-week block that ends on this day ;
 * - `since` = `start` − 1 day (margin to not miss any edge event ;
 * days prior to `start` are ignored during densification).
 * We calculate “today-in-tz” via Intl, then we manipulate bare dates in
 * UTC (no time zone drift since we only think in calendar days).
 */
function heatmapWindow(tz: string): { start: string; end: string; since: string } {
  let todayStr: string;
  try {
    todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  }
  const today = new Date(`${todayStr}T00:00:00Z`);
  // 52 weeks back, then rewind to Sunday of this week.
  const anchor = new Date(today.getTime() - 364 * DAY_MS);
  const startSunday = new Date(anchor.getTime() - anchor.getUTCDay() * DAY_MS);
  const since = new Date(startSunday.getTime() - DAY_MS);
  return { start: ymd(startSunday), end: ymd(today), since: since.toISOString() };
}

/** Densifies the sparse RPC series to one point per day from `start` to `end`. */
function densify(start: string, end: string, sparse: RawStats["days"]): HeatmapDay[] {
  const byDate = new Map(sparse.map((d) => [d.date, d]));
  const days: HeatmapDay[] = [];
  const endDate = new Date(`${end}T00:00:00Z`);
  for (let t = new Date(`${start}T00:00:00Z`).getTime(); t <= endDate.getTime(); t += DAY_MS) {
    const date = ymd(new Date(t));
    const hit = byDate.get(date);
    days.push({
      date,
      count: hit?.count ?? 0,
      issues: hit?.issues ?? 0,
      tasks: hit?.tasks ?? 0,
    });
  }
  return days;
}

/**
 * Recent momentum, read in the dense series (which ends today, in the
 * user's time zone): the last 7 days, and the 7 before that for the
 * trend. No additional query — the heatmap already covers the year.
 */
function weekTotals(days: HeatmapDay[]): StatsWeek {
  const sum = (slice: HeatmapDay[], pick: (d: HeatmapDay) => number) =>
    slice.reduce((total, d) => total + pick(d), 0);
  const last = days.slice(-7);
  const previous = days.slice(-14, -7);
  return {
    completed: sum(last, (d) => d.count),
    issues: sum(last, (d) => d.issues),
    tasks: sum(last, (d) => d.tasks),
    previous: sum(previous, (d) => d.count),
  };
}

/**
 * Aggregates the personal statistics of the current user.
 * `supabase` must be the RLS client (route handler): the RPC is SECURITY
 * INVOKER, so auth.uid() = the caller and it only reads its own lines.
 */
export async function getUserStats(
  supabase: SupabaseClient,
  { tz, userId }: { tz: string; userId: string }
): Promise<UserStats> {
  const { start, end, since } = heatmapWindow(tz);

  const [statsRes, workloadRes, cycleRes] = await Promise.all([
    supabase.rpc("get_user_stats", { p_tz: tz, p_since: since }),
    // Current load: open issues assigned to me (live, RLS scope
    // accessible projects). Detached not required — it's a snapshot of the present.
    // `projects!inner(deleted_at)` carries the trash filter: a project
    // threw keeps his tickets and `can_access_project` ignores `deleted_at`, so
    // without him the load included tickets which are no longer anywhere.
    supabase
      .from("issues")
      .select("status, projects!inner(deleted_at)")
      .is("deleted_at", null)
      .is("projects.deleted_at", null)
      .eq("assignee_id", userId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`),
    // Cycle stats (MIN-58): cadence, tickets/cycle, duration per effort.
    supabase.rpc("get_cycle_stats", { p_tz: tz }),
  ]);

  if (statsRes.error) throw new Error(statsRes.error.message);
  const raw = (statsRes.data ?? {}) as RawStats;

  // Best-effort: an error in the RPC cycles (e.g. function not yet deployed)
  // does not invalidate the page — we land on an empty cycles section.
  if (cycleRes.error) {
    console.error("[api/stats] cycle stats failed:", cycleRes.error.message);
  }
  const cycles = toCycles(
    cycleRes.error ? null : ((cycleRes.data ?? null) as RawCycleStats | null)
  );

  const days = densify(start, end, raw.days ?? []);
  const max = days.reduce((m, d) => Math.max(m, d.count), 0);

  const assignedRows = (workloadRes.data ?? []) as Array<{ status: string }>;
  const workload: StatsWorkload = {
    assignedOpen: assignedRows.length,
    inProgress: assignedRows.filter((r) => r.status === "in_progress").length,
  };

  return {
    totals: {
      created: raw.totals?.created ?? 0,
      completed: raw.totals?.completed ?? 0,
      projects: raw.totals?.projects ?? 0,
      tasksCompleted: raw.totals?.tasks_completed ?? 0,
    },
    perProject: (raw.per_project ?? []).map((p) => ({
      name: p.name,
      color: p.color,
      deleted: p.deleted,
      created: p.created,
      completed: p.completed,
    })),
    heatmap: { tz, start, end, max, days },
    workload,
    week: weekTotals(days),
    cycles,
  };
}
