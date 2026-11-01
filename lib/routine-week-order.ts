import { nextRunAt, type RoutineSchedule } from "./routine-schedule";
import { weekdayRank } from "./week-start";

export interface RoutineWeekOrderInput extends RoutineSchedule {
  title: string;
  trigger?: import("./routine-triggers").RoutineTrigger;
}

const WEEKDAY_INDEX = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

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
 * Position of a routine in the sidebar week, which starts on the account's
 * first day of the week (MIN-881, Monday by default).
 *
 * Daily routines occupy the first day at their configured time because it is
 * their first occurrence in every week. Weekly routines use their earliest configured
 * weekday. Monthly routines have no stable weekday, so their next occurrence is
 * projected into its own timezone. Invalid legacy rows sort last rather than
 * making the whole sidebar fail.
 */
export function routineWeekPosition(
  routine: RoutineWeekOrderInput,
  from = new Date(),
  weekStart: number = 1,
): number {
  if (routine.trigger && routine.trigger.type !== "schedule") return Number.POSITIVE_INFINITY;
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
      weekdays.length > 0
        ? Math.min(...weekdays.map((day) => weekdayRank(day, weekStart)))
        : null;
  } else {
    try {
      const day = weekdayAt(nextRunAt(routine, from), routine.timezone);
      weekday = day == null ? null : weekdayRank(day, weekStart);
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
  weekStart: number = 1,
): T[] {
  return [...routines].sort((left, right) => {
    const bySchedule =
      routineWeekPosition(left, from, weekStart) -
      routineWeekPosition(right, from, weekStart);
    return bySchedule || left.title.localeCompare(right.title, locale);
  });
}
