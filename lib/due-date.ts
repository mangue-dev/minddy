// Shared parsing/formatting for issue due dates and objective target dates.
// Both are stored as ISO timestamps (timestamptz) so they can carry an hour —
// but legacy rows may still be a bare "YYYY-MM-DD". Both parse to a local Date
// here so the whole UI renders them uniformly.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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
