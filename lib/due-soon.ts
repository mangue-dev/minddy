// “Near due date” window on the dashboard (MIN-96).
//
// The window is not the same for all tickets: it is worth the WEIGHT of the
// ticket, in days — xs 1, s 2, m 3, l 5, xl 8. It is the Fibonacci sequence that
// lib/cycle.ts already uses it as effort points, so we REUSE it instead
// to redeclare it: an XS only deserves attention the day before, an XL must be
// seen eight days before, and an unvalued ticket counts as an M.
//
// Everything is counted in CALENDAR DAYS of the user's time zone, never in
// milliseconds: “1 day left” means “it’s tomorrow on the
// calendar”, not “in 24 hours”. This is also the SQL convention of the repository
// for deadlines (`(due_date at time zone p_tz)::date`, cf.
// supabase/migrations/20260804090000_cycle_stats.sql).

import { EFFORT_POINTS, effortToPoints } from "./cycle";
import { DATE_ONLY } from "./due-date";
import {
  isClosedStatus,
  type IssueEffort,
  type IssueStatus,
} from "./issue-constants";

const DAY_MS = 86_400_000;

/** The largest window (XL) — this is what limits the SQL prefilter. */
export const DUE_SOON_MAX_DAYS = EFFORT_POINTS.xl;

/** The calendar day of an instant, in a given time zone ("YYYY-MM-DD").
 `en-CA` is the ISO shortcut for Intl — same recipe as `todayInTz`. */
export function calendarDayInTz(date: Date, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || "UTC" }).format(date);
  } catch {
    // Unknown time zone (tinkered header): UTC rather than an exception.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
  }
}

/** Difference in days between two calendar days "YYYY-MM-DD" (`to` − `from`).
 Both pass by midnight UTC, so no time change occurs: a calendar day is always 24 hours. */
export function daysBetweenDays(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

/** Shifts a calendar day by `n` days. */
export function addDays(day: string, n: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(ms)) return day;
  return new Date(ms + n * DAY_MS).toISOString().slice(0, 10);
}

/** The calendar day of a stored deadline, in the user's time zone. */
export function dueDateCalendarDay(
  dueDate: string,
  tz: string | null | undefined,
): string | null {
  // An inherited value without a time IS already a calendar day (the column was
  // a `date` before 20260707120000): pass it through a time zone
  // would shift by one day.
  if (DATE_ONLY.test(dueDate)) return dueDate;
  const d = new Date(dueDate);
  return Number.isNaN(d.getTime()) ? null : calendarDayInTz(d, tz);
}

/** Days remaining before due: 0 on the same day, negative late.
 `null` when the stored value is unreadable. */
export function daysUntilDue(
  dueDate: string,
  today: string,
  tz?: string | null,
): number | null {
  const day = dueDateCalendarDay(dueDate, tz);
  return day === null ? null : daysBetweenDays(today, day);
}

/** What is strictly necessary to decide — any ticket line is compliant (the complete board as well as the reduced columns of the home). */
export interface DueSoonCandidate {
  due_date: string | null;
  effort: IssueEffort | null;
  status: IssueStatus;
}

/**
 * Does the ticket fit into the section? Open, dated, and less days from
 * its deadline than its effort weighs.
 *
 * LATE tickets remain there: their difference is negative, therefore always under
 * the window. The closed statuses come out — done and canceled as requested by the
 * spec, plus duplicate, whose expiry no longer means anything.
 */
export function isDueSoon(
  issue: DueSoonCandidate,
  today: string,
  tz?: string | null,
): boolean {
  if (!issue.due_date || isClosedStatus(issue.status)) return false;
  const days = daysUntilDue(issue.due_date, today, tz);
  return days !== null && days <= effortToPoints(issue.effort);
}

/**
 * Upper limit of the SQL prefilter: an instant which we are sure to fall AFTER
 * the end of the last day retained, whatever the time zone (±14 h at worst, hence
 * the two days of margin). The exact filter remains `isDueSoon` — this one does not
 * only serves to not bring back all the deadlines in the database.
 */
export function dueSoonUpperBound(today: string): string {
  return `${addDays(today, DUE_SOON_MAX_DAYS + 2)}T00:00:00.000Z`;
}
