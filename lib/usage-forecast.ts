import type { UsageDay } from "@/lib/billing-types";

/**
 * Where the AI budget is heading by the end of the billing period (MIN-946).
 * Pure: the billing page, its budget chart, Numo's `get_plan_usage` tool and
 * Numo's word on the home page all read the same verdict.
 *
 * The pace blends the last seven days with the whole period's average, so a
 * burst of usage counts without one quiet day erasing what came before. The
 * forecast extends that pace linearly to the end of the period.
 */

export type UsageForecastStatus =
  /** Less than a day of observations, or nothing used yet: no verdict. */
  | "too_early"
  /** The period ends with a comfortable margin. */
  | "on_track"
  /** The period ends with the budget almost spent. */
  | "tight"
  /** The budget runs out before the period ends. */
  | "short"
  /** The budget is already spent. */
  | "exhausted";

export interface UsageForecastPoint {
  /** Epoch milliseconds. */
  at: number;
  /** Cumulative percent of the included budget. */
  percent: number;
}

export interface UsageForecast {
  status: UsageForecastStatus;
  /** Percent of the included budget used so far. */
  usedPercent: number;
  /** Percent of the included budget used by the end of the period at this pace. */
  projectedPercent: number;
  /** When the budget runs out at this pace, when it does before the period ends. */
  runsOutAt: string | null;
  /** End of the period: when the budget resets. */
  resetsAt: string;
  /** Whole days between the run-out and the reset (0 when it does not run out). */
  daysShort: number;
  /** The dashed line: from the last observation to the end of the period. */
  points: UsageForecastPoint[];
}

const DAY_MS = 86_400_000;
/** The recent pace looks at this many days. */
export const RECENT_WINDOW_DAYS = 7;
/** Weight of the recent pace against the period's average. */
const RECENT_WEIGHT = 0.6;
/** From this projected percent, the period ends with little margin. */
export const TIGHT_FROM_PERCENT = 85;

export function forecastUsage(input: {
  days: readonly Pick<UsageDay, "day" | "usd">[];
  includedUsd: number;
  periodStart: string;
  periodEnd: string;
  observedAt: string;
}): UsageForecast | null {
  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  const observedRaw = Date.parse(input.observedAt);
  if (
    input.includedUsd <= 0 ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(observedRaw) ||
    end <= start
  ) {
    return null;
  }
  const observed = Math.min(Math.max(observedRaw, start), end);
  const percentOf = (usd: number) => (usd / input.includedUsd) * 100;
  const usedUsd = input.days.reduce((sum, day) => sum + day.usd, 0);
  const usedPercent = percentOf(usedUsd);
  const elapsed = observed - start;
  const remaining = end - observed;
  const base = {
    usedPercent,
    resetsAt: new Date(end).toISOString(),
  };

  if (usedPercent >= 100) {
    return {
      ...base,
      status: "exhausted",
      projectedPercent: usedPercent,
      runsOutAt: null,
      daysShort: 0,
      points: [],
    };
  }
  if (elapsed < DAY_MS || usedUsd <= 0) {
    return {
      ...base,
      status: "too_early",
      projectedPercent: usedPercent,
      runsOutAt: null,
      daysShort: 0,
      points: [],
    };
  }

  // Recent pace: the last days' buckets, measured from the first one's start
  // (or the period start, when the period began inside it).
  const recent = input.days.slice(-RECENT_WINDOW_DAYS);
  const recentFrom = Math.max(start, Date.parse(`${recent[0].day}T00:00:00Z`));
  const recentSpan = Math.max(DAY_MS, observed - recentFrom);
  const recentRate = recent.reduce((sum, day) => sum + day.usd, 0) / recentSpan;
  const averageRate = usedUsd / elapsed;
  // A period shorter than the recent window has a single pace.
  const rate =
    elapsed <= RECENT_WINDOW_DAYS * DAY_MS
      ? averageRate
      : RECENT_WEIGHT * recentRate + (1 - RECENT_WEIGHT) * averageRate;

  const projectedUsd = usedUsd + rate * remaining;
  const projectedPercent = percentOf(projectedUsd);
  const runsOut =
    rate > 0 ? observed + (input.includedUsd - usedUsd) / rate : Infinity;
  const short = runsOut < end;

  const points: UsageForecastPoint[] = [{ at: observed, percent: usedPercent }];
  for (
    let at = Math.floor(observed / DAY_MS) * DAY_MS + DAY_MS;
    at < end;
    at += DAY_MS
  ) {
    points.push({ at, percent: percentOf(usedUsd + rate * (at - observed)) });
  }
  points.push({ at: end, percent: projectedPercent });

  return {
    ...base,
    status: short
      ? "short"
      : projectedPercent >= TIGHT_FROM_PERCENT
        ? "tight"
        : "on_track",
    projectedPercent,
    runsOutAt: short ? new Date(runsOut).toISOString() : null,
    daysShort: short ? Math.floor((end - runsOut) / DAY_MS) : 0,
    points,
  };
}
