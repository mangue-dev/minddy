/**
 * The CADENCE of a routine (MIN-185): when it passes again, and how to tell it.
 *
 * PURE logic, shared client + server (no import server-only): the
 * wizard calculates the first pass to show it BEFORE creating, the factory
 * calculates it to write it, and the cron recalculates it on each reset. A single
 * function for all three, otherwise the screen promises a time that the base
 * does not hold.
 *
 * **Structured, not a cron expression**: `frequency` + hour + minute + day
 * + IANA zone. A cron expression would have to be written by the user,
 * unreadable in the UI, and translated anyway to display it.
 *
 * **The time zone is always explicit** — “9 a.m.” has no meaning without it — and
 * an unknown time zone is DENIED, never silently returned to UTC: a
 * routine that starts three hours too early every morning is only noticed on
 * the bill. This is the difference with `lib/due-soon.ts`, which falls back to UTC because
 * it only puts a ticket in a column.
 */

export type RoutineFrequency = "daily" | "weekly" | "monthly";

export const ROUTINE_FREQUENCIES: RoutineFrequency[] = ["daily", "weekly", "monthly"];

export function isRoutineFrequency(value: unknown): value is RoutineFrequency {
  return typeof value === "string" && (ROUTINE_FREQUENCIES as string[]).includes(value);
}

export interface RoutineSchedule {
  frequency: RoutineFrequency;
  /** 0–23, in `timezone`. */
  hour: number;
  /** 0–59, in `timezone`. */
  minute: number;
  /**
 * The weekdays retained, 0 = Sunday … 6 = Saturday. `weekly`
 * only, and at least one — a weekly cadence with no days has no
 * occurrences. SEVERAL: “Monday and Thursday” is as legitimate a cadence as “Monday”, and treating it as a separate case would have doubled the calculation of the next pass.
 */
  weekdays?: number[] | null;
  /**
 * The days of the month retained, 1–31. `monthly` only, at least one. A 31
 * in a short month falls on its last day — and if another day in the
 * list falls in the same place, the occurrence only counts once.
 */
  daysOfMonth?: number[] | null;
  /** IANA zone (“Europe/Paris”). Never guessed. */
  timezone: string;
}

/** Lifted by `nextRunAt` and `assertSchedule` — refusal, never silent fallback. */
export class RoutineScheduleError extends Error {
  constructor(readonly code: RoutineScheduleErrorCode) {
    super(code);
    this.name = "RoutineScheduleError";
  }
}

export type RoutineScheduleErrorCode =
  | "invalidFrequency"
  | "invalidHour"
  | "invalidMinute"
  | "invalidWeekday"
  | "invalidDayOfMonth"
  | "unknownTimezone";

/** Is the time zone known to `Intl`? (A tinkered name throws up in the formatter.) */
export function isKnownTimezone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the cadence, and refuses inconsistencies in FORM as well as in value:
 * a `weekday` on a monthly cadence is a cadence that no one knows
 * to say what they want. This is a denial, not an ignored field — an ignored field
 * makes the caller think they have been heard.
 */
export function assertSchedule(schedule: RoutineSchedule): void {
  if (!isRoutineFrequency(schedule.frequency)) {
    throw new RoutineScheduleError("invalidFrequency");
  }
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23) {
    throw new RoutineScheduleError("invalidHour");
  }
  if (!Number.isInteger(schedule.minute) || schedule.minute < 0 || schedule.minute > 59) {
    throw new RoutineScheduleError("invalidMinute");
  }
  const weekdays = schedule.weekdays ?? [];
  const daysOfMonth = schedule.daysOfMonth ?? [];
  if (schedule.frequency === "weekly") {
    if (
      weekdays.length === 0 ||
      weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    ) {
      throw new RoutineScheduleError("invalidWeekday");
    }
  } else if (weekdays.length > 0) {
    throw new RoutineScheduleError("invalidWeekday");
  }
  if (schedule.frequency === "monthly") {
    if (
      daysOfMonth.length === 0 ||
      daysOfMonth.some((d) => !Number.isInteger(d) || d < 1 || d > 31)
    ) {
      throw new RoutineScheduleError("invalidDayOfMonth");
    }
  } else if (daysOfMonth.length > 0) {
    throw new RoutineScheduleError("invalidDayOfMonth");
  }
  if (!isKnownTimezone(schedule.timezone)) {
    throw new RoutineScheduleError("unknownTimezone");
  }
}

/** The fields of an instant, READ in a time zone (the counterpart of `getUTC*`). */
interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = dimanche … 6 = samedi. */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    // `hour12: false` makes midnight “24” on certain ICUs: we bring it back to 0.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/** Time zone offset at this time, in milliseconds (positive east). */
function offsetMs(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // The millisecond does not cross `formatToParts`: we put it back, otherwise
  // the offset would carry a residue under the second.
  return asUtc - (at.getTime() - at.getMilliseconds());
}

/**
 * The UTC instant where the `timeZone` clock displays this date and time.
 *
 * Two passes, and it is the time change which imposes them: the offset to
 * applied depends on the instant we are looking for, which we do not yet know. The
 * first pass gives a candidate, the second passes it with the offset
 * TRUE of this candidate. At the two annual shifts:
 * - non-existent hour (spring skips 2 h → 3 h): the result falls
 * after the jump, i.e. the first hour that exists — never the day before;
 * - doubled hour (autumn replays 2 h → 3 h): we retain the FIRST
 * occurrence, the one the clock displays first.
 */
function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = new Date(wanted - offsetMs(new Date(wanted), timeZone));
  return new Date(wanted - offsetMs(firstGuess, timeZone));
}

/** Number of days of the month (1-indexed) — to return a 31 to a short month. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The NEXT pass, strictly after `from`.
 *
 * "Strictly" is the rule: called with `from` exactly on the deadline
 * — what the cron does when it's time to reset — it ADVANCES by one period. Without
 * that, a routine rearmed on itself would restart in a loop on the next round.
 *
 * The calculation is done on the LOCAL clock of the time zone, not by adding
 * milliseconds: "every Monday at 9 a.m." remains 9 h on both sides du
 * time change, which a `+7 × 86 400 000` does not hold.
 */
export function nextRunAt(schedule: RoutineSchedule, from: Date): Date {
  assertSchedule(schedule);
  const tz = schedule.timezone;
  const now = zonedParts(from, tz);

  if (schedule.frequency === "daily") {
    // Today at the appointed time, otherwise tomorrow. We start from the local date and
    // on ajoute des JOURS de calendrier, jamais 24 h.
    for (let add = 0; add <= 2; add++) {
      const d = new Date(Date.UTC(now.year, now.month - 1, now.day + add));
      const at = zonedTimeToUtc(
        tz,
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
        schedule.hour,
        schedule.minute,
      );
      if (at.getTime() > from.getTime()) return at;
    }
    // Unattainable: two days in advance covers all delays.
    throw new RoutineScheduleError("invalidFrequency");
  }

  if (schedule.frequency === "weekly") {
    // Several days possible: we look at EACH day saved, we keep the
    // first occurrence to come. Two weeks horizon is enough (the worst
    // case is “today, but the time has passed”).
    const targets = [...new Set(schedule.weekdays as number[])];
    let best: Date | null = null;
    for (const target of targets) {
      let delta = (target - now.weekday + 7) % 7;
      for (let attempt = 0; attempt < 2; attempt++) {
        const d = new Date(Date.UTC(now.year, now.month - 1, now.day + delta));
        const at = zonedTimeToUtc(
          tz,
          d.getUTCFullYear(),
          d.getUTCMonth() + 1,
          d.getUTCDate(),
          schedule.hour,
          schedule.minute,
        );
        if (at.getTime() > from.getTime()) {
          if (!best || at.getTime() < best.getTime()) best = at;
          break;
        }
        delta += 7;
      }
    }
    if (!best) throw new RoutineScheduleError("invalidWeekday");
    return best;
  }

  // Monthly: each day requested, reduced to the last day of shorter months —
  // “the 31st” in February means the end of February, not “we’re skipping this month”.
  // Two days on the list can therefore fall in the SAME place (30 and 31 in
  // February): it's one occurrence, not two, and taking the minimum rules it
  // without having to duplicate.
  const wantedDays = [...new Set(schedule.daysOfMonth as number[])];
  for (let add = 0; add <= 2; add++) {
    const year = now.year + Math.floor((now.month - 1 + add) / 12);
    const month = ((now.month - 1 + add) % 12) + 1;
    const last = daysInMonth(year, month);
    let best: Date | null = null;
    for (const wanted of wantedDays) {
      const at = zonedTimeToUtc(
        tz,
        year,
        month,
        Math.min(wanted, last),
        schedule.hour,
        schedule.minute,
      );
      if (at.getTime() > from.getTime() && (!best || at.getTime() < best.getTime())) {
        best = at;
      }
    }
    if (best) return best;
  }
  throw new RoutineScheduleError("invalidDayOfMonth");
}

/**
 * Translates a cadence into a sentence, with the caller's i18n catalog.
 *
 * It is used for the wizard summary AND for the routine header: the SAME
 * function, otherwise the two surfaces end up saying two things of the same
 * routine. All three messages carry placeholders (`{time}`, `{weekday}`,
 * `{day}`, `{timezone}`) — so they are called with their values.
 */
export function describeSchedule(
  schedule: RoutineSchedule,
  t: (
    key:
      | "cadenceDaily"
      | "cadenceWeekly"
      | "cadenceMonthly"
      | "cadenceDailyShort"
      | "cadenceWeeklyShort"
      | "cadenceMonthlyShort",
    values: Record<string, string | number>,
  ) => string,
  opts?: {
    weekdayLabel?: (weekday: number) => string;
    locale?: string;
    /**
 * Without the time zone — the COLUMN version. “(Europe/Paris)” takes up
 * more space than the cadence itself, on a line which must be looked at. The time zone is read in the routine, where it really counts
 *: this is where we check what time it leaves.
 */
    omitTimezone?: boolean;
  },
): string {
  const time = formatTimeOfDay(schedule.hour, schedule.minute, opts?.locale);
  const short = opts?.omitTimezone === true;
  if (schedule.frequency === "daily") {
    return short
      ? t("cadenceDailyShort", { time })
      : t("cadenceDaily", { time, timezone: schedule.timezone });
  }
  if (schedule.frequency === "weekly") {
    // The days IN ORDER of the week, whatever order they are in
    // been checked — “Monday and Thursday”, never “Thursday and Monday”.
    const days = sortedWeekdays(schedule.weekdays);
    const weekday = joinList(
      days.map((d) => opts?.weekdayLabel?.(d) ?? weekdayName(d, opts?.locale)),
      opts?.locale,
    );
    return short
      ? t("cadenceWeeklyShort", { weekday, time })
      : t("cadenceWeekly", { weekday, time, timezone: schedule.timezone });
  }
  const days = [...new Set(schedule.daysOfMonth ?? [1])].sort((a, b) => a - b);
  const day = joinList(days.map(String), opts?.locale);
  return short
    ? t("cadenceMonthlyShort", { day, time })
    : t("cadenceMonthly", { day, time, timezone: schedule.timezone });
}

/**
 * Weekdays sorted in the order WEEK presents them — Monday
 * first, Sunday at the end —, not in the 0–6 order of `Intl`, which would make
 * start the list with Sunday.
 */
export function sortedWeekdays(weekdays: number[] | null | undefined): number[] {
  const rank = (d: number) => (d + 6) % 7;
  return [...new Set(weekdays ?? [1])].sort((a, b) => rank(a) - rank(b));
}

/** “Monday, Tuesday and Thursday” — the conjunction is that of the language. */
function joinList(parts: string[], locale?: string): string {
  if (parts.length <= 1) return parts[0] ?? "";
  try {
    return new Intl.ListFormat(locale || "en-US", {
      style: "long",
      type: "conjunction",
    }).format(parts);
  } catch {
    return parts.join(", ");
  }
}

/** “09:00” / “9:00 AM” depending on the locale — the time as we read it. */
export function formatTimeOfDay(hour: number, minute: number, locale?: string): string {
  // January 4, 1970 is a Sunday in UTC: any date does
  // the case, only the time is formatted.
  const at = new Date(Date.UTC(1970, 0, 4, hour, minute));
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** The name of the day of the week in the user's language. */
export function weekdayName(weekday: number, locale?: string): string {
  // January 4, 1970 = Sunday: +weekday gives the correct day.
  const at = new Date(Date.UTC(1970, 0, 4 + (weekday % 7)));
  return new Intl.DateTimeFormat(locale || "en-US", {
    timeZone: "UTC",
    weekday: "long",
  }).format(at);
}

/**
 * The name of the day, capital first — the form of a field LABEL ("Monday"),
 * which is not that of a word IN a sentence ("every Monday"). French
 * writes the days in lower case throughout the text: capitalizing everywhere would have
 * damaged the cadence phrase to arrange the selector.
 */
export function weekdayLabel(weekday: number, locale?: string): string {
  const name = weekdayName(weekday, locale);
  return name.charAt(0).toLocaleUpperCase(locale || "en-US") + name.slice(1);
}

/** The browser zone, or UTC outside the browser (the wizard pre-fills it). */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
