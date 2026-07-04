import { CircleDashed, CircleDot, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

// Objective status is FIXED (plan.md §6).
export type ObjectiveStatus = "planned" | "in_progress" | "done" | "canceled";

export interface ObjectiveStatusMeta {
  value: ObjectiveStatus;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const OBJECTIVE_STATUSES: ObjectiveStatusMeta[] = [
  { value: "planned", label: "Planifié", icon: CircleDashed, color: "text-muted-foreground" },
  { value: "in_progress", label: "En cours", icon: CircleDot, color: "text-amber-500" },
  { value: "done", label: "Terminé", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "canceled", label: "Annulé", icon: XCircle, color: "text-muted-foreground" },
];

export const OBJECTIVE_STATUS_MAP: Record<ObjectiveStatus, ObjectiveStatusMeta> =
  Object.fromEntries(OBJECTIVE_STATUSES.map((s) => [s.value, s])) as Record<
    ObjectiveStatus,
    ObjectiveStatusMeta
  >;

export const OBJECTIVE_STATUS_VALUES = OBJECTIVE_STATUSES.map((s) => s.value);
