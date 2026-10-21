// Recurrence of a ticket (MIN-136): cadences and calculation of the next
// due date. Shared client/server — the picker uses it to announce the
// next date, lib/server/recurrence.ts to place it on the occurrence
// following. No dependency: neither React, nor next-intl, nor supabase.

import { isDueDateOverdue, parseDueDate } from "./due-date";

export const RECURRENCE_CADENCES = ["daily", "weekly", "monthly", "yearly"] as const;

export type RecurrenceCadence = (typeof RECURRENCE_CADENCES)[number];

export const isRecurrenceCadence = (v: unknown): v is RecurrenceCadence =>
  typeof v === "string" && (RECURRENCE_CADENCES as readonly string[]).includes(v);

/** Cadence or null — what the field is worth in an API payload. */
export const isRecurrenceOrNull = (v: unknown): v is RecurrenceCadence | null =>
  v === null || isRecurrenceCadence(v);

/**
 * The identifier of the SERIES of a ticket: its `recurrence_series_id`, or its
 * own id. The original ticket does not have a series - it is his series;
 * each occurrence it generates receives its id. A convention rather than
 * more writing at creation, and only one way to group a series.
 */
export function seriesIdOf(issue: {
  id: string;
  recurrence_series_id?: string | null;
}): string {
  return issue.recurrence_series_id ?? issue.id;
}

const DAY_MS = 86_400_000;

/** Guardrail of the catch-up loop: it starts from an estimate, therefore
    two or three turns are always enough. Beyond that, an aberrant date. */
const MAX_STEPS = 64;

/**
 * The deadline for the next occurrence.
 *
 * `base` is the deadline of the occurrence which has just been completed: it is
 * which sets the pace, not the closing date — a Monday review finished on
 * Wednesday falls on the following Monday. And a ticket remained open three
 * month does not produce an occurrence that is already late: we move forward by as much
 * cadences it takes to get back in front of `now`.
 *
 * The date is CLAMPED: January 31 + 1 month gives February 28 (the 29
 * leap years), not March 3 as `setUTCMonth` alone would do. And
 * each step is recalculated from `base`, never from the clamped result —
 * an end-of-month deadline, the remainder for the following month.
 *
 * The calculation works on the UTC components, due to lack of knowing the time zone.
 * whoever it is: minddy doesn't store it anywhere. Two discrepancies arise from this,
 * assumed — the wall time slides by one hour when the time changes, and the
 * end of month clamp may fall a day too late for a deadline without
 * time east of Greenwich (midnight in Paris, it is 11 p.m. UTC the day before).
 */
export function nextDueDate(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): Date {
  return advanceFrom(base, cadence, now, 1);
}

/**
 * The deadline that follows `due` in a series laid on the grid of `anchor`
 * (MIN-697). The grid is recalculated from the anchor, so a series started
 * on January 31 comes back to March 31 after February 28 instead of
 * keeping the clamped day. `due` must sit on that grid (see
 * {@link seriesAnchor}); otherwise this is plain {@link nextDueDate}.
 */
export function nextDueDateFrom(
  anchor: Date,
  due: Date,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): Date {
  const step = gridStep(anchor, cadence, due);
  if (step === null) return nextDueDate(due, cadence, now);
  return advanceFrom(anchor, cadence, now, step + 1);
}

/**
 * The anchor of the occurrence due at `due`: the oldest earlier occurrence
 * of the series whose grid still lands on `due`, walking back from the most
 * recent one (MIN-697).
 *
 * Only monthly and yearly cadences clamp a day (31 → 28, February 29 →
 * 28), and only them lose the original day of the month: the walk stops at
 * the first occurrence whose grid misses `due` — an explicit date change, a
 * different cadence — so an anchor never reaches past a deliberate edit.
 */
export function seriesAnchor(
  due: Date,
  cadence: RecurrenceCadence,
  earlier: readonly Date[],
): Date {
  if (cadence !== "monthly" && cadence !== "yearly") return due;
  const previous = earlier
    .filter((d) => d.getTime() < due.getTime())
    .sort((a, b) => b.getTime() - a.getTime());
  let anchor = due;
  for (const candidate of previous) {
    if (gridStep(candidate, cadence, due) === null) break;
    anchor = candidate;
  }
  return anchor;
}

/** The number of cadences that lead from `base` exactly to `target`, or null
    when `target` is not an occurrence of `base`. */
function gridStep(base: Date, cadence: RecurrenceCadence, target: Date): number | null {
  const estimate = estimateSteps(base, cadence, target);
  for (const step of [estimate, estimate + 1]) {
    if (addCadence(base, cadence, step).getTime() === target.getTime()) return step;
  }
  return null;
}

/**
 * The DEPARTURE deadline for a recurrence: the chosen date if it is still
 * ahead, otherwise the first occurrence to come.
 *
 * What the user designates in the calendar is the rhythm — “the
 * Monday”, “the 3rd of the month” — not a fixed date. Choose last Monday in
 * weekly therefore means “every Monday”, and the next deadline is
 * next Monday: a recurring ticket is not born late.
 *
 * Unlike {@link nextDueDate}, which ALWAYS advances by at least one
 * cadence (the completed occurrence must give way), this may not
 * bouger du tout.
 */
export function startDueDate(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): Date {
  return advanceFrom(base, cadence, now, 0);
}

/**
 * Advance `base` by at least `minSteps` cadences, then as much as necessary to
 * no longer be late — “late” in the sense of the rest of the app
 * ({@link isDueDateOverdue}): a deadline without a time is valid until the end of its
 * day, a deadline dated up to its time.
 */
function advanceFrom(
  base: Date,
  cadence: RecurrenceCadence,
  now: Date,
  minSteps: number,
): Date {
  // Start from an estimate rather than `minSteps`: without it, a deadline
  // vieille de dix ans en quotidien ferait quelques milliers de tours.
  let steps = Math.max(minSteps, estimateSteps(base, cadence, now));
  let next = addCadence(base, cadence, steps);
  for (let i = 0; isDueDateOverdue(next, now.getTime()) && i < MAX_STEPS; i++) {
    steps += 1;
    next = addCadence(base, cadence, steps);
  }
  return next;
}

/**
 * Occurrences in a series that fall between `from` and `to`, `base`
 * understood. Used for the picker's calendar, which shows in blue the next
 * ticket deadlines: they come from the SAME arithmetic as that which
 * will really pose (end of month clamp included), so what is highlighted is
 * exactement ce qui arrivera.
 *
 * Nothing before `base`: a recurrence does not go back in time.
 */
export function occurrencesBetween(
  base: Date,
  cadence: RecurrenceCadence,
  from: Date,
  to: Date,
  max = 64,
): Date[] {
  const out: Date[] = [];
  // Starting near `from` rather than `base`: a ten-year-old series
  // does not have to be scrolled day by day to display a month.
  const first = Math.max(0, estimateSteps(base, cadence, from));
  for (let i = 0; i < max * 2 && out.length < max; i++) {
    const d = addCadence(base, cadence, first + i);
    if (d.getTime() > to.getTime()) break;
    if (d.getTime() >= from.getTime()) out.push(d);
  }
  return out;
}

/** How many cadences separate `base` from `now`, rounded DEFAULT: the loop
    call only advances forward, it must never go too far. */
function estimateSteps(base: Date, cadence: RecurrenceCadence, now: Date): number {
  const diff = now.getTime() - base.getTime();
  if (diff <= 0) return 0;
  switch (cadence) {
    case "daily":
      return Math.floor(diff / DAY_MS);
    case "weekly":
      return Math.floor(diff / (7 * DAY_MS));
    case "monthly":
      return (
        (now.getUTCFullYear() - base.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - base.getUTCMonth())
      );
    case "yearly":
      return now.getUTCFullYear() - base.getUTCFullYear();
  }
}

/** `base` advanced by `steps` cadences (see the date clamp above). */
function addCadence(base: Date, cadence: RecurrenceCadence, steps: number): Date {
  const next = new Date(base.getTime());
  switch (cadence) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + steps);
      return next;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7 * steps);
      return next;
    case "monthly":
      return shiftMonths(base, steps);
    case "yearly":
      return shiftMonths(base, 12 * steps);
  }
}

/** Shift by `months` month while keeping the date, clamped at the end of the month. */
function shiftMonths(base: Date, months: number): Date {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth() + months;
  const day = base.getUTCDate();
  // Day 0 of the following month = last day of the target month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(base.getTime());
  next.setUTCFullYear(year, month, Math.min(day, lastDay));
  return next;
}

/**
 * The next due date from a STORED value (ISO, or the old form
 * “YYYY-MM-DD”), rendered in ISO. Null when there is no departure date
 * exploitable — a recurrence without deadline does not exist (the API refuses it),
 * but a line written before this rule could still be lying around.
 */
export function nextDueDateISO(
  storedDueDate: string | null | undefined,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): string | null {
  const base = parseDueDate(storedDueDate);
  if (!base) return null;
  return nextDueDate(base, cadence, now).toISOString();
}

/**
 * {@link nextDueDateISO} for an occurrence of a series: `earlierDueDates`
 * are the STORED deadlines of the series' previous occurrences, which give
 * back the original day of the month (see {@link seriesAnchor}).
 */
export function nextSeriesDueDateISO(
  storedDueDate: string | null | undefined,
  cadence: RecurrenceCadence,
  earlierDueDates: ReadonlyArray<string | null | undefined>,
  now: Date = new Date(),
): string | null {
  const due = parseDueDate(storedDueDate);
  if (!due) return null;
  const earlier = earlierDueDates
    .map((value) => parseDueDate(value))
    .filter((d): d is Date => d !== null);
  return nextDueDateFrom(seriesAnchor(due, cadence, earlier), due, cadence, now).toISOString();
}

/**
 * The starting deadline for a recurrence, from a STORED value — see
 * {@link startDueDate}. Rendered AS IS if not already passed, for
 * that a writing which changes nothing does not seem to do so (the activity event
 * and the original format are preserved).
 */
export function startDueDateISO(
  storedDueDate: string | null | undefined,
  cadence: RecurrenceCadence,
  now: Date = new Date(),
): string | null {
  const base = parseDueDate(storedDueDate);
  if (!base) return null;
  if (!isDueDateOverdue(base, now.getTime())) return storedDueDate ?? null;
  return startDueDate(base, cadence, now).toISOString();
}
