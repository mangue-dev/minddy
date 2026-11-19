import { EFFORT_POINTS } from "./cycle";
import { EFFORTS } from "./issue-constants";
import type { HeatmapDay, StatsCycleEffort } from "./types";

/** Number → localized string (FR comma, EN period), 1 decimal place by default. */
export function fmtNum(value: number, locale: string, digits = 1): string {
  return value.toLocaleString(locale, { maximumFractionDigits: digits });
}

/** Readable completion time: minutes < 90 min, hours < 48 h, otherwise days.
 * Returns the unit message key + the already rounded value. */
export function durationParts(seconds: number): {
  key: "durationMinutes" | "durationHours" | "durationDays";
  value: number;
} {
  const minutes = seconds / 60;
  if (minutes < 90) return { key: "durationMinutes", value: Math.round(minutes) };
  const hours = seconds / 3600;
  if (hours < 48) return { key: "durationHours", value: Math.round(hours * 10) / 10 };
  return { key: "durationDays", value: Math.round((seconds / 86400) * 10) / 10 };
}

/** Current streak (consecutive days ending at today, gracefully if the
 * current day is still empty) + record on the window. */
export function computeStreaks(days: HeatmapDay[]): {
  current: number;
  longest: number;
} {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    if (d.count > 0) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue; // aujourd'hui vide : pas de rupture
    else break;
  }
  return { current, longest };
}

/** Totals from the heatmap window (the last 12 months), to give a
 * leading number to the grid of squares rather than leaving it without a scale.
 * `completed`, when the server sends it, counts each issue once: summing the
 * days would count an issue completed again once per completion. */
export function heatmapTotals(
  days: HeatmapDay[],
  completed?: { issues: number; tasks: number },
): {
  total: number;
  issues: number;
  tasks: number;
  activeDays: number;
} {
  let total = 0;
  let issues = 0;
  let tasks = 0;
  let activeDays = 0;
  for (const d of days) {
    total += d.count;
    issues += d.issues;
    tasks += d.tasks;
    if (d.count > 0) activeDays++;
  }
  if (completed) {
    return {
      total: completed.issues + completed.tasks,
      issues: completed.issues,
      tasks: completed.tasks,
      activeDays,
    };
  }
  return { total, issues, tasks, activeDays };
}

/** Whole-number share of completed issues, on a true 0–100% scale. */
export function completionShare(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/**
 * Calendar day (YYYY-MM-DD) of an ISO instant in the `tz`.
 *
 * Used to locate the registration date on the heatmap: by passing `heatmap.tz`,
 * we redo EXACTLY the bucketing that the server applies to events
 * (`to_char((occurred_at at time zone p_tz)::date, ...)`), so the box marked
 * is indeed that of the correct day, including for an account created at 11 p.m. in Paris.
 * `en-CA` is the usual shortcut to obtain a short ISO via Intl.
 */
export function dayInZone(
  iso: string | null | undefined,
  tz: string,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
  }
}

/**
 * Fills the effort sizes nobody has completed yet from the measured ones
 * (MIN-1023), so a new account sees a full scale after a few issues.
 *
 * Each measured size gives a time per Fibonacci point (its median divided by
 * its points, xs1 s2 m3 l5 xl8 xxl13 — the cycle capacity scale). The rates
 * are averaged weighted by sample, so a size measured on ten issues counts more
 * than one measured on a single issue, and every missing size gets that rate
 * times its points. Measured sizes are returned untouched: real data always
 * wins over an estimate. Without any measured size there is nothing to scale
 * from, and the list stays empty.
 */
export function estimateMissingEffortMedians(
  measured: StatsCycleEffort[],
): StatsCycleEffort[] {
  const real = measured.filter((row) => !row.estimated && row.sample > 0);
  const totalSample = real.reduce((sum, row) => sum + row.sample, 0);
  if (totalSample === 0) return [];
  const secondsPerPoint =
    real.reduce(
      (sum, row) =>
        sum + (row.medianSeconds / EFFORT_POINTS[row.effort]) * row.sample,
      0,
    ) / totalSample;
  const byEffort = new Map(real.map((row) => [row.effort, row] as const));
  return EFFORTS.map(({ value }) => {
    return (
      byEffort.get(value) ?? {
        effort: value,
        medianSeconds: Math.round(secondsPerPoint * EFFORT_POINTS[value]),
        sample: 0,
        estimated: true,
      }
    );
  });
}
