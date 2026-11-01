// The first day of the week (MIN-881), chosen in Account → Preferences and
// stored in the account's Supabase auth `user_metadata.week_start` (same
// mechanism as the send shortcut or the Numo landing status). Server-safe: no
// React import, so lib helpers and route handlers share the same resolver.
//
// Weekdays follow the JavaScript numbering everywhere: 0 = Sunday … 6 = Saturday.

export const WEEK_START_META_KEY = "week_start";

/** `auto` follows the interface language; the others pin a day. Order = picker order. */
export const WEEK_START_OPTIONS = ["auto", "monday", "sunday", "saturday"] as const;

export type WeekStartPreference = (typeof WEEK_START_OPTIONS)[number];

/** A weekday a week may start on, in JavaScript numbering. */
export type WeekStartDay = 0 | 1 | 6;

const PINNED: Record<Exclude<WeekStartPreference, "auto">, WeekStartDay> = {
  monday: 1,
  sunday: 0,
  saturday: 6,
};

export const isWeekStartPreference = (v: unknown): v is WeekStartPreference =>
  typeof v === "string" && (WEEK_START_OPTIONS as readonly string[]).includes(v);

/** Read the preference from a user's auth user_metadata; `auto` when unset or invalid. */
export function resolveWeekStartPreference(
  meta: Record<string, unknown> | null | undefined,
): WeekStartPreference {
  const value = meta?.[WEEK_START_META_KEY];
  return isWeekStartPreference(value) ? value : "auto";
}

/**
 * The week start of an interface language. It matches the date-fns locales the
 * date picker used before the preference existed (Sunday for American English
 * and Brazilian Portuguese, Monday for the European languages), so `auto`
 * changes nothing for an account that never touched the setting.
 */
export function localeWeekStart(locale: string | null | undefined): WeekStartDay {
  const language = (locale ?? "en").toLowerCase();
  return language === "en" || language.startsWith("en-") || language === "pt-br" ? 0 : 1;
}

/** The weekday the account's weeks start on. */
export function resolveWeekStart(
  preference: WeekStartPreference,
  locale: string | null | undefined,
): WeekStartDay {
  return preference === "auto" ? localeWeekStart(locale) : PINNED[preference];
}

/** Position of `weekday` in a week starting on `weekStart` (0 = first day). */
export function weekdayRank(weekday: number, weekStart: number): number {
  return (((weekday - weekStart) % 7) + 7) % 7;
}

/** The seven weekdays in the order a week starting on `weekStart` lists them. */
export function orderedWeekdays(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
}
