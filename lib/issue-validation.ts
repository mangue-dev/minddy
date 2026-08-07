// Server-safe value lists + validators for issue enums (no React/lucide import,
// so route handlers can use them). Mirrors lib/issue-constants.ts.

export const ISSUE_STATUSES = [
  "triage",
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done",
  "canceled",
  "duplicate",
] as const;
// Ordre croissant, comme `PRIORITIES` dans lib/issue-constants.ts : ces listes
// ne servent pas qu'à valider, elles se RENDENT — le sélecteur de valeurs de
// l'import (components/settings/import-mapping-editor.tsx) et la réponse de
// /api/v1/issues/options les déroulent telles quelles.
export const ISSUE_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export const ISSUE_EFFORTS = ["xs", "s", "m", "l", "xl"] as const;

export type IssueStatusValue = (typeof ISSUE_STATUSES)[number];
export type IssuePriorityValue = (typeof ISSUE_PRIORITIES)[number];
export type IssueEffortValue = (typeof ISSUE_EFFORTS)[number];

export const isStatus = (v: unknown): v is IssueStatusValue =>
  typeof v === "string" && (ISSUE_STATUSES as readonly string[]).includes(v);
export const isPriority = (v: unknown): v is IssuePriorityValue =>
  typeof v === "string" && (ISSUE_PRIORITIES as readonly string[]).includes(v);
export const isEffort = (v: unknown): v is IssueEffortValue =>
  typeof v === "string" && (ISSUE_EFFORTS as readonly string[]).includes(v);

/** An ISO date ("YYYY-MM-DD") or datetime ("…THH:MM[:SS][Z|±hh:mm]"), or null.
 *  Échéances carry a time now, so plain dates and full timestamps are both ok. */
export const isDateOrNull = (v: unknown): v is string | null =>
  v === null ||
  (typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.test(v));
