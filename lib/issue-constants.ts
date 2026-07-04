import {
  CircleDashed,
  Circle,
  CircleDot,
  Eye,
  CheckCircle2,
  XCircle,
  Minus,
  SignalLow,
  SignalMedium,
  SignalHigh,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

// All three axes are FIXED (plan.md §4) — not customizable per project.

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "canceled";
export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";
export type IssueEffort = "xs" | "s" | "m" | "l" | "xl";

export interface StatusMeta {
  value: IssueStatus;
  label: string;
  icon: LucideIcon;
  /** Tailwind text-color class for the icon. */
  color: string;
}

// Order = kanban column order (plan.md §4).
export const STATUSES: StatusMeta[] = [
  { value: "backlog", label: "Backlog", icon: CircleDashed, color: "text-muted-foreground" },
  { value: "todo", label: "Todo", icon: Circle, color: "text-muted-foreground" },
  { value: "in_progress", label: "In Progress", icon: CircleDot, color: "text-amber-500" },
  { value: "in_review", label: "In Review", icon: Eye, color: "text-violet-500" },
  { value: "done", label: "Done", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "canceled", label: "Canceled", icon: XCircle, color: "text-muted-foreground" },
];

export const STATUS_MAP: Record<IssueStatus, StatusMeta> = Object.fromEntries(
  STATUSES.map((s) => [s.value, s])
) as Record<IssueStatus, StatusMeta>;

export interface PriorityMeta {
  value: IssuePriority;
  label: string;
  icon: LucideIcon;
  color: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { value: "none", label: "Aucune", icon: Minus, color: "text-muted-foreground" },
  { value: "urgent", label: "Urgent", icon: AlertTriangle, color: "text-red-500" },
  { value: "high", label: "Haute", icon: SignalHigh, color: "text-orange-500" },
  { value: "medium", label: "Moyenne", icon: SignalMedium, color: "text-yellow-500" },
  { value: "low", label: "Basse", icon: SignalLow, color: "text-sky-500" },
];

export const PRIORITY_MAP: Record<IssuePriority, PriorityMeta> = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p])
) as Record<IssuePriority, PriorityMeta>;

export interface EffortMeta {
  value: IssueEffort;
  label: string;
}

export const EFFORTS: EffortMeta[] = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL" },
];

export const EFFORT_MAP: Record<IssueEffort, EffortMeta> = Object.fromEntries(
  EFFORTS.map((e) => [e.value, e])
) as Record<IssueEffort, EffortMeta>;

/** Format the human identifier for an issue, e.g. "MIND-42". */
export function issueIdentifier(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}
