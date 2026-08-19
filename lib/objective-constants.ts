import { CircleDashed, CircleDot, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

// Objective status is fixed. The value list itself lives in
// lib/objective-validation.ts, which imports nothing — server code (route
// handlers, Numo's tool schemas) reads it there rather than dragging lucide in.
export { OBJECTIVE_STATUS_VALUES, isObjectiveStatus } from "./objective-validation";
export type { ObjectiveStatus } from "./objective-validation";

import type { ObjectiveStatus } from "./objective-validation";

// Labels are i18n'd — resolve via useTranslations("ObjectiveStatus")(value).
export interface ObjectiveStatusMeta {
  value: ObjectiveStatus;
  icon: LucideIcon;
  color: string;
}

export const OBJECTIVE_STATUSES: ObjectiveStatusMeta[] = [
  { value: "planned", icon: CircleDashed, color: "text-muted-foreground" },
  { value: "in_progress", icon: CircleDot, color: "text-amber-500" },
  { value: "done", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "canceled", icon: XCircle, color: "text-muted-foreground" },
];

export const OBJECTIVE_STATUS_MAP: Record<ObjectiveStatus, ObjectiveStatusMeta> =
  Object.fromEntries(OBJECTIVE_STATUSES.map((s) => [s.value, s])) as Record<
    ObjectiveStatus,
    ObjectiveStatusMeta
  >;
