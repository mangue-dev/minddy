// Shared parsing/formatting for issue due dates and objective target dates.
// Both are stored as ISO timestamps (timestamptz) so they can carry an hour —
// but legacy rows may still be a bare "YYYY-MM-DD". Both parse to a local Date
// here so the whole UI renders them uniformly.

/** A legacy value “YYYY-MM-DD”: a calendar day, with no time or
 time zone. Exported because lib/due-soon.ts must recognize the same form. */
export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a stored due/target value into a local Date, or null when unset/invalid. */
export function parseDueDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // A bare date is local midnight; a full ISO string carries its own offset.
  const d = DATE_ONLY.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whether the value carries a meaningful time (i.e. not local midnight). */
export function dueDateHasTime(d: Date): boolean {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

/**
 * Is the deadline behind us? A dated *hour* is late once it has passed; a bare
 * day is late only once the day is over — otherwise every issue due today would
 * render as overdue from midnight on.
 */
export function isDueDateOverdue(d: Date, now: number = Date.now()): boolean {
  if (dueDateHasTime(d)) return d.getTime() < now;
  const endOfDay = new Date(d);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay.getTime() < now;
}

/* ── Deadline in relative ───────────────────────── ────────────────────────── */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Local midnight of the day of a date — the marker for counts in DAYS. */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days between two moments, in the browser's time zone.
 `Math.round` absorbs the 23h or 25h days of time changes. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfLocalDay(to) - startOfLocalDay(from)) / DAY_MS);
}

/**
 * What there is to SAY about a deadline, in relative terms - the putting into words (and its
 * translation) remains in the component.
 *
 * `named` covers yesterday / today / tomorrow, the three days which have a name:
 * we names them rather than counting them, adding the time if the en
 * ticket has one (“tomorrow at 2:00 p.m.”). Beyond that, `counted` gives a deviation.
 */
export type RelativeDue =
  | { kind: "named"; day: "yesterday" | "today" | "tomorrow"; time: Date | null }
  | { kind: "counted"; days: number; hours: number; past: boolean };

/**
 * The gap between now and a deadline, ready to be put into words.
 *
 * Two units of measurement coexist, and this is intentional: a deadline WITHOUT time se
 * counts in calendar days (a deadline on the 30th is "in 3 days" on 27,
 * whatever time it is), while a deadline WITH time is
 * counts in real duration, which allows the "in 2 days and 3 hours" which a
 * count of days alone would not be able to say.
 */
export function relativeDue(d: Date, now: Date = new Date()): RelativeDue {
  const time = dueDateHasTime(d) ? d : null;
  const days = calendarDaysBetween(now, d);

  if (days >= -1 && days <= 1) {
    const day = days === 0 ? "today" : days === 1 ? "tomorrow" : "yesterday";
    return { kind: "named", day, time };
  }

  // Without a time, the real duration would lie: at 2 p.m., a deadline of D+3 is due
  // 2 days and 10 hours of midnight, but it remains “in 3 days”.
  if (!time) return { kind: "counted", days: Math.abs(days), hours: 0, past: days < 0 };

  const diff = d.getTime() - now.getTime();
  // Round to the hour BEFORE cutting, never after: truncating would say “in
  // 2 days and 2 hours » of a deadline at 2 d 2 h 59, and round the hours
  // alone could produce a “2 days and 24 hours” which does not exist.
  const hoursLeft = Math.round(Math.abs(diff) / HOUR_MS);
  return {
    kind: "counted",
    days: Math.floor(hoursLeft / 24),
    hours: hoursLeft % 24,
    past: diff < 0,
  };
}

/** The subset of Intl date options we use — narrow enough to stay assignable to
 *  both the DOM's `Intl.DateTimeFormatOptions` and next-intl's stricter type. */
export type DueDateFormatOptions = {
  day?: "numeric" | "2-digit";
  month?: "numeric" | "2-digit" | "short" | "long" | "narrow";
  year?: "numeric" | "2-digit";
  hour?: "numeric" | "2-digit";
  minute?: "numeric" | "2-digit";
};

/**
 * Intl options for rendering a due date. `compact` drops the year (for tight
 * spots like the card chip); the time is appended only when it isn't midnight,
 * so legacy date-only values stay clean.
 */
export function dueDateFormat(
  d: Date,
  opts: { compact?: boolean } = {},
): DueDateFormatOptions {
  const base: DueDateFormatOptions = opts.compact
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" };
  return dueDateHasTime(d)
    ? { ...base, hour: "2-digit", minute: "2-digit" }
    : base;
}
