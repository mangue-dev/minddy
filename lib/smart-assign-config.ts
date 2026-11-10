/**
 * What a *written* assignment rule is, for Smart Assign (MIN-31).
 *
 * Three places ask the same question and must answer it the same: the
 * runner which chooses an assignee (lib/server/smart-assign.ts), the warning
 * of dashboard, and project settings that show what's missing. The
 * answer fits into one line — a string of blanks doesn't count — but it's
 * exactly the kind of line that diverges when written three times.
 */

/** Members, among those past, who do not have a written rule. */
export function userIdsWithoutRule(
  userIds: string[],
  rules: Record<string, string> | null | undefined
): string[] {
  return userIds.filter((id) => !rules?.[id]?.trim());
}

/** At least one rule written in the team — otherwise the model would only have
 names to compare, and the assignment falls on the owner. */
export function hasAnyRule(
  userIds: string[],
  rules: Record<string, string> | null | undefined
): boolean {
  return userIds.some((id) => !!rules?.[id]?.trim());
}

/**
 * "Assign from" (MIN-957): the status from which Smart Assign may assign an
 * issue, set per project by its owner. `backlog` assigns every issue past
 * triage; `todo` waits until the issue is committed. `in_progress` is not
 * offered: an issue gets there because someone starts it, and that person
 * takes it.
 */
export const SMART_ASSIGN_FROM_STATUSES = ["backlog", "todo"] as const;
export type SmartAssignFromStatus = (typeof SMART_ASSIGN_FROM_STATUSES)[number];
export const DEFAULT_SMART_ASSIGN_FROM_STATUS: SmartAssignFromStatus = "backlog";

/** The setting as written by a client, or `null` when it is not one of the values. */
export function parseSmartAssignFromStatus(value: unknown): SmartAssignFromStatus | null {
  return (SMART_ASSIGN_FROM_STATUSES as readonly unknown[]).includes(value)
    ? (value as SmartAssignFromStatus)
    : null;
}

/** The setting as stored on a project. A row read before the column existed,
 * or a value this release does not know, keeps the default behavior. */
export function smartAssignFromStatusOf(
  project: { smart_assign_from_status?: unknown } | null | undefined
): SmartAssignFromStatus {
  return parseSmartAssignFromStatus(project?.smart_assign_from_status) ?? DEFAULT_SMART_ASSIGN_FROM_STATUS;
}

/** Workflow order of the statuses Smart Assign acts on. Triage, canceled and
 * duplicate are not in it: no setting reaches them. */
const SMART_ASSIGN_STATUS_ORDER = ["backlog", "todo", "in_progress", "in_review", "done"];

/** Whether an issue in `status` has reached the project's start status. */
export function smartAssignReaches(fromStatus: SmartAssignFromStatus, status: unknown): boolean {
  const index = SMART_ASSIGN_STATUS_ORDER.indexOf(status as string);
  return index >= 0 && index >= SMART_ASSIGN_STATUS_ORDER.indexOf(fromStatus);
}

/** The statuses a backfill fills (MIN-903): accepted work nobody started,
 * from the project's start status up to todo. Triage is left out because the
 * issue is assigned once it reaches the start status. */
export const SMART_ASSIGN_BACKFILL_STATUSES = ["backlog", "todo"] as const;

export function isSmartAssignBackfillStatus(
  status: unknown,
  fromStatus: SmartAssignFromStatus = DEFAULT_SMART_ASSIGN_FROM_STATUS
): boolean {
  return (
    (SMART_ASSIGN_BACKFILL_STATUSES as readonly unknown[]).includes(status) &&
    smartAssignReaches(fromStatus, status)
  );
}

/** What the label needs from the project: the toggle, the start status, when
 * new statuses were last covered, and whether a backfill the owner asked for
 * is still running. */
export interface SmartAssignProjectState {
  smart_assign_enabled?: boolean | null;
  smart_assign_from_status?: string | null;
  smart_assign_enabled_at?: string | null;
  smart_assign_backfill_requested_at?: string | null;
}

/** What the label needs from the issue. `createdAt: null` is an issue that
 * does not exist yet (the creation form); `undefined` is an issue whose age
 * the caller does not know, which is then not assumed to be recent. */
export interface SmartAssignIssueState {
  status: string | null | undefined;
  assigneeId: string | null | undefined;
  createdAt: string | null | undefined;
}

/**
 * Whether an empty assignee means "Smart Assign will choose" rather than
 * "nobody" (MIN-811), so the assignee pickers name it instead of offering
 * "Unassigned". The label follows what Smart Assign really does (MIN-903):
 *
 * - canceled and duplicate issues are never assigned by it;
 * - an issue below the project's start status is not assigned yet (MIN-957).
 *   Triage reads "Smart Assign" only when the start status is backlog, the
 *   status the issue enters when it leaves triage;
 * - an issue that has an assignee, or does not exist yet: emptying the field
 *   makes Smart Assign choose, so the empty option names it;
 * - an open issue with no assignee is filled only if it was created after
 *   Smart Assign started covering its status, or while a backfill is filling
 *   the backlog. Otherwise nothing will assign it, and it reads "Unassigned".
 */
export function smartAssignFillsEmptyAssignee(
  project: SmartAssignProjectState | null | undefined,
  issue: SmartAssignIssueState
): boolean {
  if (project?.smart_assign_enabled !== true) return false;
  if (issue.status === "canceled" || issue.status === "duplicate") return false;
  const fromStatus = smartAssignFromStatusOf(project);
  if (issue.status === "triage") return fromStatus === "backlog";
  // A caller that does not know the status is not held below the start status.
  if (issue.status && !smartAssignReaches(fromStatus, issue.status)) return false;
  if (issue.assigneeId || issue.createdAt === null) return true;
  if (
    project.smart_assign_backfill_requested_at &&
    isSmartAssignBackfillStatus(issue.status, fromStatus)
  ) {
    return true;
  }
  const enabledAt = Date.parse(project.smart_assign_enabled_at ?? "");
  const createdAt = Date.parse(issue.createdAt ?? "");
  return Number.isFinite(enabledAt) && Number.isFinite(createdAt) && createdAt >= enabledAt;
}

/**
 * Whether an empty objective lead means "Smart Assign will choose" (MIN-919):
 * the project has Smart Assign on and the objective is still open. A done or
 * canceled objective keeps "No lead", as a canceled issue keeps "Unassigned".
 */
export function objectiveSmartAssignEligible(
  enabled: boolean | null | undefined,
  status: unknown
): boolean {
  return enabled === true && status !== "done" && status !== "canceled";
}
