/**
 * Numo's reminders (MIN-923): the shapes and limits shared by the server
 * repository, the Numo tools and the settings screen. A reminder ("watch")
 * is a condition on one object plus an instruction; the routines clock fires
 * it once when the condition holds.
 *
 * A recurring reminder (MIN-953) is a date reminder with a cadence: it comes
 * back at a wall-clock time in the user's zone, runs a Numo turn each time,
 * and may carry permissions ("grants") the user confirmed when setting it.
 */

import { ISSUE_STATUSES, type IssueStatusValue } from "@/lib/issue-validation";
import { OBJECTIVE_STATUS_VALUES, type ObjectiveStatus } from "@/lib/objective-validation";

/** Active reminders one user may keep. */
export const NUMO_WATCH_LIMIT = 20;

/** Days a reminder waits before it expires unfired. */
export const NUMO_WATCH_EXPIRY_DAYS = 90;

/**
 * Characters in one instruction. A note body holds 600 characters and the
 * `act` and fallback notes wrap the instruction in a sentence, so 500 keeps
 * it whole in every note.
 */
export const NUMO_WATCH_INSTRUCTION_MAX = 500;

/** A date watch stays active this long past its time, for a clock that missed it. */
export const NUMO_WATCH_DATE_GRACE_MS = 24 * 60 * 60 * 1000;

/** Active recurring reminders one user may keep, within `NUMO_WATCH_LIMIT`. */
export const NUMO_RECURRING_WATCH_LIMIT = 5;

/**
 * An occurrence the clock missed by more than this is skipped: the next one
 * comes soon enough, and a late run would land next to it.
 */
export const NUMO_RECURRING_GRACE_MS = 6 * 60 * 60 * 1000;

/** Occurrences in a row that may fail before the reminder is paused. */
export const NUMO_RECURRING_FAILURE_LIMIT = 3;

export const NUMO_WATCH_CADENCES = ["daily", "weekdays", "weekly", "monthly"] as const;
export type NumoWatchCadence = (typeof NUMO_WATCH_CADENCES)[number];

/**
 * When a recurring reminder comes back: `time` is `HH:MM` on the wall clock
 * of the reminder's time zone. `weekday` is 1 (Monday) to 7 (Sunday). A
 * month shorter than `day` uses its last day.
 */
export type NumoWatchRecurrence =
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; time: string; weekday: number }
  | { kind: "monthly"; time: string; day: number };

/**
 * What a recurring reminder's unattended turn may be allowed to do: the
 * sensitive categories of the background guard
 * (`lib/server/assistant/proactive-guard.ts`). The user grants them one by
 * one when the reminder is set; a category not granted stays refused.
 */
export const NUMO_WATCH_GRANTS = [
  "notification",
  "outside_scope",
  "pull_request",
  "external",
  "public_reply",
  "trash",
  "delete",
  "account",
  "administration",
] as const;
export type NumoWatchGrant = (typeof NUMO_WATCH_GRANTS)[number];

export const NUMO_WATCH_ACTIONS = ["notify", "act"] as const;
export type NumoWatchAction = (typeof NUMO_WATCH_ACTIONS)[number];

/** `paused`: a recurring reminder that waits for the user to resume it. */
export const NUMO_WATCH_STATUSES = ["active", "fired", "canceled", "expired", "paused"] as const;
export type NumoWatchStatus = (typeof NUMO_WATCH_STATUSES)[number];

/** `muted`: it fired while the user had Messages from Numo turned off. */
export const NUMO_WATCH_OUTCOMES = ["notified", "muted", "acted", "budget_fallback", "failed"] as const;
export type NumoWatchOutcome = (typeof NUMO_WATCH_OUTCOMES)[number];

/** What a reminder waits for, as `create_watch` names it. */
export const NUMO_WATCH_WHEN = ["issue_status", "issue_comment", "objective_status", "date"] as const;
export type NumoWatchWhen = (typeof NUMO_WATCH_WHEN)[number];

export type NumoWatchTarget =
  | { type: "issue"; id: string; condition: { kind: "status"; status: IssueStatusValue } }
  | { type: "issue"; id: string; condition: { kind: "comment" } }
  | { type: "objective"; id: string; condition: { kind: "status"; status: ObjectiveStatus } }
  | { type: "date"; id: null; condition: { kind: "date" }; fireAt: string };

/** How the settings screen and the tools describe a reminder. */
export interface NumoWatchItem {
  id: string;
  user_id: string;
  /** Null for a personal reminder (MIN-982): a date reminder of no project. */
  project_id: string | null;
  target_type: "issue" | "objective" | "date";
  target_id: string | null;
  condition: { kind: "status"; status: string } | { kind: "comment" } | { kind: "date" };
  action: NumoWatchAction;
  instruction: string;
  conversation_id: string | null;
  /** The user's IANA time zone when it was set; null when unknown. */
  timezone: string | null;
  status: NumoWatchStatus;
  /** A recurring reminder's next occurrence. */
  fire_at: string | null;
  expires_at: string;
  /** For a recurring reminder, `fired_at` and `outcome` are its last occurrence's. */
  fired_at: string | null;
  outcome: NumoWatchOutcome | null;
  /** Null for a one-off reminder. */
  recurrence: NumoWatchRecurrence | null;
  /** What the user allowed a recurring reminder's turn to do. */
  grants: NumoWatchGrant[];
  consecutive_failures: number;
  created_at: string;
}

/**
 * The stored form of an instruction: trimmed, with runs of blank space
 * collapsed. Null when empty or too long.
 */
export function normalizeNumoWatchInstruction(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > NUMO_WATCH_INSTRUCTION_MAX) return null;
  return text;
}

/**
 * An ISO 8601 date-time with its offset (`Z` or `±hh:mm`). A date without
 * one would be read in the server's zone, not the user's.
 */
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseNumoWatchDate(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_WITH_OFFSET.test(value.trim())) return null;
  const at = new Date(value.trim());
  return Number.isFinite(at.getTime()) ? at : null;
}

export function isNumoWatchIssueStatus(value: unknown): value is IssueStatusValue {
  return typeof value === "string" && (ISSUE_STATUSES as readonly string[]).includes(value);
}

export function isNumoWatchObjectiveStatus(value: unknown): value is ObjectiveStatus {
  return typeof value === "string" && (OBJECTIVE_STATUS_VALUES as readonly string[]).includes(value);
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The stored form of a cadence, or null when it is not one. */
export function parseNumoWatchRecurrence(value: unknown): NumoWatchRecurrence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { kind, time, weekday, day } = value as Record<string, unknown>;
  if (typeof time !== "string" || !TIME.test(time)) return null;
  if (kind === "daily" || kind === "weekdays") return { kind, time };
  if (kind === "weekly") {
    return Number.isInteger(weekday) && (weekday as number) >= 1 && (weekday as number) <= 7
      ? { kind, time, weekday: weekday as number }
      : null;
  }
  if (kind === "monthly") {
    return Number.isInteger(day) && (day as number) >= 1 && (day as number) <= 31
      ? { kind, time, day: day as number }
      : null;
  }
  return null;
}

/**
 * The grants in a list, each once, in the order of `NUMO_WATCH_GRANTS`. Null
 * when the value is not a list or names something that is not a grant.
 */
export function parseNumoWatchGrants(value: unknown): NumoWatchGrant[] | null {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.some((item) => !(NUMO_WATCH_GRANTS as readonly unknown[]).includes(item))) return null;
  return NUMO_WATCH_GRANTS.filter((grant) => value.includes(grant));
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClock(at: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
  }).formatToParts(new Date(at));
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read("year"), month: read("month"), day: read("day"),
    hour: read("hour"), minute: read("minute"), second: read("second"),
  };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const wall = wallClock(at, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(at / 1000) * 1000;
}

/**
 * The instant a wall-clock time names in a zone. A time that a change to
 * summer time skips lands an hour later; a time that the change back
 * repeats is taken once.
 */
function instantOf(year: number, month: number, day: number, hour: number, minute: number,
  timeZone: string): number {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The offset is read at a first guess, then again at the instant it gives:
  // the two differ only across a change of hour.
  const guess = wall - zoneOffset(wall, timeZone);
  return wall - zoneOffset(guess, timeZone);
}

/**
 * The first occurrence of a cadence strictly after `after`. Pure. Days are
 * counted on the zone's calendar, so a daily 19:00 stays at 19:00 across a
 * change of hour.
 */
export function nextOccurrence(recurrence: NumoWatchRecurrence, timeZone: string, after: Date): Date {
  const [hour, minute] = recurrence.time.split(":").map(Number);
  const today = wallClock(after.getTime(), timeZone);
  // A calendar day, moved with UTC arithmetic: only its date fields are read.
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day));
  // The longest wait is from the 31st to the last day of the next month.
  for (let step = 0; step < 64; step++) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    // 1 (Monday) to 7 (Sunday).
    const weekday = ((cursor.getUTCDay() + 6) % 7) + 1;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const due = recurrence.kind === "daily"
      || (recurrence.kind === "weekdays" && weekday <= 5)
      || (recurrence.kind === "weekly" && weekday === recurrence.weekday)
      || (recurrence.kind === "monthly" && day === Math.min(recurrence.day, lastDay));
    if (due) {
      const at = instantOf(year, month, day, hour, minute, timeZone);
      if (at > after.getTime()) return new Date(at);
    }
    cursor.setUTCDate(day + 1);
  }
  throw new Error("No next occurrence");
}

/**
 * A recurring reminder Numo proposed with permissions (MIN-953). Nothing is
 * saved until the user confirms it on the card the conversation shows:
 * `create_watch` returns it, and the confirmation sends it back.
 */
export interface NumoWatchProposal {
  /** The id the reminder takes, so confirming twice writes once. */
  id: string;
  /** Null for a personal reminder (MIN-982). */
  project_id: string | null;
  instruction: string;
  recurrence: NumoWatchRecurrence;
  grants: NumoWatchGrant[];
  timezone: string;
  /** The first occurrence, as computed when Numo proposed it. */
  next_at: string | null;
  /** The reminder this one replaces, cancelled on confirmation. */
  replaces: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The proposal in a value that crossed the wire, or null when it is not one. */
export function parseNumoWatchProposal(value: unknown): NumoWatchProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const recurrence = parseNumoWatchRecurrence(raw.recurrence);
  const grants = parseNumoWatchGrants(raw.grants);
  const instruction = normalizeNumoWatchInstruction(raw.instruction);
  const replaces = raw.replaces === null || raw.replaces === undefined ? null : raw.replaces;
  if (typeof raw.id !== "string" || !UUID.test(raw.id)) return null;
  if (raw.project_id !== null && (typeof raw.project_id !== "string" || !UUID.test(raw.project_id))) return null;
  if (!recurrence || !grants || !instruction || !isValidTimeZone(raw.timezone)) return null;
  if (replaces !== null && (typeof replaces !== "string" || !UUID.test(replaces))) return null;
  return {
    id: raw.id.toLowerCase(),
    project_id: typeof raw.project_id === "string" ? raw.project_id.toLowerCase() : null,
    instruction,
    recurrence,
    grants,
    timezone: raw.timezone,
    next_at: typeof raw.next_at === "string" ? raw.next_at : null,
    replaces: replaces ? replaces.toLowerCase() : null,
  };
}
