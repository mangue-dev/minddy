// All three axes are fixed and not customizable per project.

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
export type IssueEffort = "xs" | "s" | "m" | "l" | "xl" | "xxl";

// Labels are i18n'd — resolve via useTranslations("Status")(value). The glyph
// is `<StatusIndicator status={…} />` (components/issue-indicators.tsx).
export interface StatusMeta {
  value: IssueStatus;
}

// Order = kanban column order. Board columns only — triage and
// duplicate issues are deliberately absent from the kanban.
export const STATUSES: StatusMeta[] = [
  { value: "backlog" },
  { value: "todo" },
  { value: "in_progress" },
  { value: "in_review" },
  { value: "done" },
  { value: "canceled" },
];

// Full status list for pickers: triage first (arrival zone), duplicate last
// (closed as a duplicate of another issue).
export const ALL_STATUSES: StatusMeta[] = [
  { value: "triage" },
  ...STATUSES,
  { value: "duplicate" },
];

const STATUS_VALUES = new Set<string>(ALL_STATUSES.map((s) => s.value));

export function isIssueStatus(value: unknown): value is IssueStatus {
  return typeof value === "string" && STATUS_VALUES.has(value);
}

// Terminal statuses: a closed issue is finished for tracking purposes — it no
// longer blocks the issues it gates, and drops out of "active" counts. The
// server's reads (lib/server/issue-reads.ts) and the cycle arithmetic
// (lib/cycle.ts) use this same list.
export const CLOSED_STATUSES: readonly IssueStatus[] = [
  "done",
  "canceled",
  "duplicate",
];
export const isClosedStatus = (status: IssueStatus): boolean =>
  CLOSED_STATUSES.includes(status);

/** The open work: started or ready to start, out of triage and not closed. */
export const OPEN_STATUSES: readonly IssueStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
];

/** Every other status: still in triage, or closed. */
export const NOT_OPEN_STATUSES: readonly IssueStatus[] = ["triage", ...CLOSED_STATUSES];

// Labels are i18n'd — resolve via useTranslations("Priority")(value). The
// glyph is `<PriorityIndicator priority={…} />`.
export interface PriorityMeta {
  value: IssuePriority;
}

// ASCENDING order — first option = lowest, last = highest.
// This is the convention for ALL selectors in the app (issues, objectives,
// feedback): `EFFORTS` goes from xs to xxl, the statuses go from arrival to
// terminal, the priority rises from "none" to "urgent". A selector is a scale
// read from top to bottom, and a scale that runs the other way on one field
// forces the order to be reread on each one.
//
// This is the DISPLAY order; sorting BY priority puts urgent first and reads
// {@link PRIORITY_RANK}.
export const PRIORITIES: PriorityMeta[] = [
  { value: "none" },
  { value: "low" },
  { value: "medium" },
  { value: "high" },
  { value: "urgent" },
];

/** How pressing a priority is: none 0 … urgent 4, from {@link PRIORITIES}. */
export const PRIORITY_RANK: Record<IssuePriority, number> = Object.fromEntries(
  PRIORITIES.map((p, index) => [p.value, index])
) as Record<IssuePriority, number>;

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
  { value: "xxl", label: "XXL" },
];

export const EFFORT_MAP: Record<IssueEffort, EffortMeta> = Object.fromEntries(
  EFFORTS.map((e) => [e.value, e])
) as Record<IssueEffort, EffortMeta>;

/** Format the human identifier for an issue, e.g. "MIND-42". */
export function issueIdentifier(projectKey: string, number: number): string {
  return `${projectKey}-${number}`;
}

/**
 * A selection's identifiers as one comma-separated line, smallest first
 * (MIN-833): by issue number, then by project key when a cross-project
 * selection holds the same number twice.
 */
export function sortedIdentifierList(
  issues: ReadonlyArray<{ projectKey: string; number: number }>,
): string {
  return [...issues]
    .sort((a, b) => a.number - b.number || a.projectKey.localeCompare(b.projectKey))
    .map((issue) => issueIdentifier(issue.projectKey, issue.number))
    .join(", ");
}

/**
 * The identifier the project's next issue will receive, e.g. "MIND-43", read
 * from the counter that reserves issue numbers. Null when the project row does
 * not carry the counter, so callers fall back to a generic label.
 */
export function nextIssueIdentifier(project: {
  key: string;
  issue_seq?: number | null;
}): string | null {
  if (typeof project.issue_seq !== "number" || !Number.isInteger(project.issue_seq)) return null;
  return issueIdentifier(project.key, Math.max(project.issue_seq, 0) + 1);
}
