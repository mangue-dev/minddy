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

/** The statuses a backfill fills (MIN-903): accepted work nobody started.
 * Triage is left out because the issue is assigned when it leaves triage. */
export const SMART_ASSIGN_BACKFILL_STATUSES = ["backlog", "todo"] as const;

export function isSmartAssignBackfillStatus(status: unknown): boolean {
  return (SMART_ASSIGN_BACKFILL_STATUSES as readonly unknown[]).includes(status);
}

/** What the label needs from the project: the toggle, when it was last turned
 * on, and whether a backfill the owner asked for is still running. */
export interface SmartAssignProjectState {
  smart_assign_enabled?: boolean | null;
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
 * - an issue that has an assignee, or does not exist yet: emptying the field
 *   makes Smart Assign choose, so the empty option names it;
 * - an issue in triage is assigned when it leaves triage;
 * - an open issue with no assignee is filled only if it was created after
 *   Smart Assign was turned on, or while a backfill is filling the backlog.
 *   Otherwise nothing will assign it, and it reads "Unassigned".
 */
export function smartAssignFillsEmptyAssignee(
  project: SmartAssignProjectState | null | undefined,
  issue: SmartAssignIssueState
): boolean {
  if (project?.smart_assign_enabled !== true) return false;
  if (issue.status === "canceled" || issue.status === "duplicate") return false;
  if (issue.assigneeId || issue.createdAt === null) return true;
  if (issue.status === "triage") return true;
  if (
    project.smart_assign_backfill_requested_at &&
    isSmartAssignBackfillStatus(issue.status)
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
