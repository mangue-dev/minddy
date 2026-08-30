// Objective status is fixed. The value list itself lives in
// lib/objective-validation.ts, which imports nothing — server code (route
// handlers, Numo's tool schemas) reads it there rather than dragging UI code in.
export { OBJECTIVE_STATUS_VALUES, isObjectiveStatus } from "./objective-validation";
export type { ObjectiveStatus } from "./objective-validation";

import type { ObjectiveStatus } from "./objective-validation";
import type { IssueStatus } from "./issue-constants";

// Labels are i18n'd — resolve via useTranslations("ObjectiveStatus")(value).
export interface ObjectiveStatusMeta {
  value: ObjectiveStatus;
  /** The ticket status whose indicator is reused for this objective state. */
  issueStatus: IssueStatus;
}

export const OBJECTIVE_STATUSES: ObjectiveStatusMeta[] = [
  { value: "planned", issueStatus: "todo" },
  { value: "in_progress", issueStatus: "in_progress" },
  { value: "done", issueStatus: "done" },
  { value: "canceled", issueStatus: "canceled" },
];

export const OBJECTIVE_STATUS_MAP: Record<ObjectiveStatus, ObjectiveStatusMeta> =
  Object.fromEntries(OBJECTIVE_STATUSES.map((s) => [s.value, s])) as Record<
    ObjectiveStatus,
    ObjectiveStatusMeta
  >;
