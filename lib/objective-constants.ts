import { CircleDashed, CircleDot, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

// Objective status is FIXED (plan.md §6).
export type ObjectiveStatus = "planned" | "in_progress" | "done" | "canceled";

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

export const OBJECTIVE_STATUS_VALUES = OBJECTIVE_STATUSES.map((s) => s.value);
