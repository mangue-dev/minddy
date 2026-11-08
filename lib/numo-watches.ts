/**
 * Numo's reminders (MIN-923): the shapes and limits shared by the server
 * repository, the Numo tools and the settings screen. A reminder ("watch")
 * is a condition on one object plus an instruction; the routines clock fires
 * it once when the condition holds.
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

export const NUMO_WATCH_ACTIONS = ["notify", "act"] as const;
export type NumoWatchAction = (typeof NUMO_WATCH_ACTIONS)[number];

export const NUMO_WATCH_STATUSES = ["active", "fired", "canceled", "expired"] as const;
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
  project_id: string;
  target_type: "issue" | "objective" | "date";
  target_id: string | null;
  condition: { kind: "status"; status: string } | { kind: "comment" } | { kind: "date" };
  action: NumoWatchAction;
  instruction: string;
  conversation_id: string | null;
  /** The user's IANA time zone when it was set; null when unknown. */
  timezone: string | null;
  status: NumoWatchStatus;
  fire_at: string | null;
  expires_at: string;
  fired_at: string | null;
  outcome: NumoWatchOutcome | null;
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
