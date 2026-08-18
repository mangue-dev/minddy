/**
 * Commonly used window (MIN-72, annual plans). Billing can be
 * ANNUAL, but usage is reset EVERY MONTH: we divide the period
 * Stripe into monthly sub-cycles anchored on the day of the period (the
 * `current_period_start`). An annual subscriber pays once a year but finds
 * his budget every month, on the same date. Taken from the tested logic of AutoKap.
 *
 * The annual is detected by the DURATION of the Stripe period (> 45 d), not by a
 * config of env: the window remains correct even if the annual price IDs do not
 * are not yet entered. Pure module (UTC dates), without server dependency.
 */

export interface UsageWindow {
  /** Start of current window (ISO). */
  start: string;
  /** End of window = date of next reset (ISO). */
  end: string;
}

/** Beyond this duration, the Stripe period is annual (monthly ≤ 31 days). */
const YEARLY_MIN_PERIOD_MS = 45 * 24 * 60 * 60 * 1000;

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Date on the same day/time as the anchor, projected on (year, monthIndex), day
 * clamped to the last day of the target month (e.g. anchor on 31 → 28/29 in February). */
function anchoredUtcDate(anchor: Date, year: number, monthIndex: number): Date {
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, monthIndex));
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds()
    )
  );
}

/** Start of the current monthly sub-cycle for an annual subscription. */
export function yearlyCycleStart(anchor: Date, now: Date): Date {
  let cycleStart = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth());
  if (cycleStart.getTime() > now.getTime()) {
    cycleStart = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth() - 1);
  }
  // Never before the actual start of the subscription.
  return cycleStart.getTime() < anchor.getTime() ? new Date(anchor) : cycleStart;
}

/** Next monthly reset (end of the current sub-cycle) for an annual subscription. */
export function yearlyNextReset(anchor: Date, now: Date): Date {
  let nextReset = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth());
  if (nextReset.getTime() <= now.getTime()) {
    nextReset = anchoredUtcDate(anchor, now.getUTCFullYear(), now.getUTCMonth() + 1);
  }
  return nextReset;
}

/**
 * Usage window from a stored Stripe period. Monthly → period
 * as is. Annual → the current monthly sub-cycle, `end` clamped at the end
 * of the annual period (renewal will restart the sub-cycles).
 */
export function resolveUsageWindow(params: {
  periodStart: string;
  periodEnd: string;
  now?: Date;
}): UsageWindow | null {
  const start = new Date(params.periodStart);
  const end = new Date(params.periodEnd);
  const now = params.now ?? new Date();

  if (!isValidDate(start) || !isValidDate(end) || end.getTime() < start.getTime()) {
    return null;
  }

  const isYearly = end.getTime() - start.getTime() > YEARLY_MIN_PERIOD_MS;
  if (!isYearly) {
    return { start: params.periodStart, end: params.periodEnd };
  }

  const cycleStart = yearlyCycleStart(start, now);
  const nextReset = yearlyNextReset(start, now);
  const clampedEnd = nextReset.getTime() > end.getTime() ? end : nextReset;
  return { start: cycleStart.toISOString(), end: clampedEnd.toISOString() };
}
