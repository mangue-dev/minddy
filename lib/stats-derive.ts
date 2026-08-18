import type { HeatmapDay, StatProjectBucket } from "./types";

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
 * leading number to the grid of squares rather than leaving it without a scale. */
export function heatmapTotals(days: HeatmapDay[]): {
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
  return { total, issues, tasks, activeDays };
}

/** Share of a project in the total completed tickets, in whole % (0 if the
 * total is zero). Serves the label, not the bar width — this compares to the larger project to remain readable when everything is small. */
export function projectShare(bucket: StatProjectBucket, total: number): number {
  if (total <= 0) return 0;
  return Math.round((bucket.completed / total) * 100);
}

/** Total tickets completed for all projects combined (share basis). */
export function projectsTotal(buckets: StatProjectBucket[]): number {
  return buckets.reduce((sum, b) => sum + b.completed, 0);
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
