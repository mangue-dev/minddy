// Server-safe value list + validator for the objective status enum (no
// React/lucide import, so route handlers and the assistant tool schemas can use
// it). Twin of lib/issue-validation.ts; lib/objective-constants.ts builds its
// icon/color metadata on top of this list.

export const OBJECTIVE_STATUS_VALUES = [
  "planned",
  "in_progress",
  "done",
  "canceled",
] as const;

export type ObjectiveStatus = (typeof OBJECTIVE_STATUS_VALUES)[number];

export const isObjectiveStatus = (v: unknown): v is ObjectiveStatus =>
  typeof v === "string" &&
  (OBJECTIVE_STATUS_VALUES as readonly string[]).includes(v);
