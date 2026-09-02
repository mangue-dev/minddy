import { nextRunAt, type RoutineSchedule } from "./routine-schedule";

export interface RoutineWeekOrderInput extends RoutineSchedule {
  title: string;
}

const WEEKDAY_INDEX = new Map([
  ["Mon", 0],
  ["Tue", 1],
  ["Wed", 2],
  ["Thu", 3],
  ["Fri", 4],
  ["Sat", 5],
  ["Sun", 6],
]);

/** Converts the schedule's Sunday-first weekday to a Monday-first position. */
function mondayFirst(weekday: number): number {
  return (weekday + 6) % 7;
}

/** Reads an instant's local weekday in the routine's own timezone. */
function weekdayAt(instant: Date, timezone: string): number | null {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    }).format(instant);
    return WEEKDAY_INDEX.get(weekday) ?? null;
  } catch {
    return null;
  }
}

/**
 * Position of a routine in a Monday-to-Sunday sidebar week.
 *
 * Daily routines occupy Monday at their configured time because Monday is their
 * first occurrence in every week. Weekly routines use their earliest configured
 * weekday. Monthly routines have no stable weekday, so their next occurrence is
 * projected into its own timezone. Invalid legacy rows sort last rather than
 * making the whole sidebar fail.
 */
export function routineWeekPosition(
  routine: RoutineWeekOrderInput,
  from = new Date(),
): number {
  if (
    !Number.isInteger(routine.hour) ||
    routine.hour < 0 ||
    routine.hour > 23 ||
    !Number.isInteger(routine.minute) ||
    routine.minute < 0 ||
    routine.minute > 59
  ) {
    return Number.POSITIVE_INFINITY;
  }
  let weekday: number | null = null;
  if (routine.frequency === "daily") {
    weekday = 0;
  } else if (routine.frequency === "weekly") {
    const weekdays = (routine.weekdays ?? []).filter(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    );
    weekday =
      weekdays.length > 0 ? Math.min(...weekdays.map(mondayFirst)) : null;
  } else {
    try {
      weekday = weekdayAt(nextRunAt(routine, from), routine.timezone);
    } catch {
      weekday = null;
    }
  }

  if (weekday == null) return Number.POSITIVE_INFINITY;
  return weekday * 24 * 60 + routine.hour * 60 + routine.minute;
}

/** Returns a new routine array ordered by weekday, time, then title. */
export function orderRoutinesWithinWeek<T extends RoutineWeekOrderInput>(
  routines: readonly T[],
  locale?: string,
  from = new Date(),
): T[] {
  return [...routines].sort((left, right) => {
    const bySchedule =
      routineWeekPosition(left, from) - routineWeekPosition(right, from);
    return bySchedule || left.title.localeCompare(right.title, locale);
  });
}
