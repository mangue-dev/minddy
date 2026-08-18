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
