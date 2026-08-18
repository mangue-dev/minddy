import {
  CircleDashed,
  Circle,
  CircleDot,
  Copy,
  Eye,
  CheckCircle2,
  Filter,
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
  | "triage"
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "canceled"
  | "duplicate";
export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";
export type IssueEffort = "xs" | "s" | "m" | "l" | "xl";

// Labels are i18n'd — resolve via useTranslations("Status")(value).
export interface StatusMeta {
  value: IssueStatus;
  /**
 * LEGACY — do NOT show status with this. The glyph for a status is
 * `<StatusIndicator status={…} />` (components/issue-indicators.tsx): the
 * rings/pie charts/disks of the Figma design, used by the cards, the
 * columns, all pickers and the palette command. These lucid icons are the
 * game before this design; they only survive because `StatusMeta` is
 * also the shape of the kanban columns (where only `value` counts).
 */
  icon: LucideIcon;
  /** LEGACY, like `icon` — color lives in StatusIndicator. */
  color: string;
}

// Order = kanban column order (plan.md §4). Board columns ONLY — triage and
// duplicate issues are deliberately absent from the kanban.
export const STATUSES: StatusMeta[] = [
  { value: "backlog", icon: CircleDashed, color: "text-muted-foreground" },
  { value: "todo", icon: Circle, color: "text-muted-foreground" },
  { value: "in_progress", icon: CircleDot, color: "text-amber-500" },
  { value: "in_review", icon: Eye, color: "text-violet-500" },
  { value: "done", icon: CheckCircle2, color: "text-emerald-500" },
  { value: "canceled", icon: XCircle, color: "text-muted-foreground" },
];

// Full status list for pickers: triage first (arrival zone), duplicate last
// (closed as a duplicate of another issue).
export const ALL_STATUSES: StatusMeta[] = [
  { value: "triage", icon: Filter, color: "text-orange-500" },
  ...STATUSES,
  { value: "duplicate", icon: Copy, color: "text-muted-foreground" },
];

export const STATUS_MAP: Record<IssueStatus, StatusMeta> = Object.fromEntries(
  ALL_STATUSES.map((s) => [s.value, s])
) as Record<IssueStatus, StatusMeta>;

// Terminal statuses: a closed issue is finished for tracking purposes — it no
// longer blocks the issues it gates, and drops out of "active" counts. Mirrors
// the server-side CLOSED_STATUSES (lib/server/issue-reads.ts) and lib/cycle.ts.
export const CLOSED_STATUSES: readonly IssueStatus[] = [
  "done",
  "canceled",
  "duplicate",
];
export const isClosedStatus = (status: IssueStatus): boolean =>
  CLOSED_STATUSES.includes(status);

// Labels are i18n'd — resolve via useTranslations("Priority")(value).
export interface PriorityMeta {
  value: IssuePriority;
  /** LEGACY, like `StatusMeta.icon` — displaying priority goes through
 * `<PriorityIndicator priority={…} />` (signal bars filled from below,
 * red square “!” for urgent). */
  icon: LucideIcon;
  /** LEGACY, like `icon` — color lives in PriorityIndicator. */
  color: string;
}

// ASCENDING order — first option = lowest, last = highest.
// This is the convention for ALL selectors in the app (tickets, objectives,
// returns): `EFFORTS` goes from xs to xl, the statuses go up from arrival to
// terminal, the priority increases from “none” to “urgent”. The selector is a
// scale that is read from top to bottom, and a scale that goes down from one axis to
// the other forces the order to be reread in each field.
//
// This is the DISPLAY order, not the sorting order: classify tickets BY
// priority puts the urgent first, and these two sorts have their own tables
// (`PRIORITY_ORDER` in lib/view-filter.ts, `PRIORITY_RANK` in lib/cycle.ts).
export const PRIORITIES: PriorityMeta[] = [
  { value: "none", icon: Minus, color: "text-muted-foreground" },
  { value: "low", icon: SignalLow, color: "text-sky-500" },
  { value: "medium", icon: SignalMedium, color: "text-yellow-500" },
  { value: "high", icon: SignalHigh, color: "text-orange-500" },
  { value: "urgent", icon: AlertTriangle, color: "text-red-500" },
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
