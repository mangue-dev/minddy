import type { IssueStatusValue } from "@/lib/issue-validation";

// Account preference (Account → Preferences): when enabled, moving an
// *unassigned* issue to "in_progress" self-assigns it to the current user.
// Stored in the account's Supabase auth `user_metadata.auto_assign_on_start` —
// same mechanism as `prompt_copy_auto_start` / `numo_default_status`. Enabled by
// default: the preference is only off when explicitly set to `false`. It pairs
// with `prompt_copy_auto_start` so a Shift+P "pick this up" gesture both starts
// the issue *and* makes it yours. Server-safe: imports only the enum type, no
// React/lucide, so route handlers and the assistant loop can use it too.

export const AUTO_ASSIGN_ON_START_META_KEY = "auto_assign_on_start";

/** Read whether starting an issue should self-assign it, from the user's auth
 *  user_metadata. Defaults to enabled (true) unless explicitly turned off. */
export function resolveAutoAssignOnStart(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return meta?.[AUTO_ASSIGN_ON_START_META_KEY] !== false;
}

/** Decide whether a status change should self-assign the issue. Returns the id
 *  to assign (the current user's), or null to leave the assignee untouched.
 *  Fires only on a genuine transition INTO in_progress of an UNASSIGNED issue,
 *  so it never steals someone else's assignment nor re-fires on later edits. */
export function autoAssignOnStart({
  meta,
  currentStatus,
  currentAssigneeId,
  nextStatus,
  userId,
}: {
  meta: Record<string, unknown> | null | undefined;
  currentStatus: IssueStatusValue;
  currentAssigneeId: string | null;
  nextStatus: IssueStatusValue | undefined;
  userId: string | null | undefined;
}): string | null {
  if (!userId) return null;
  if (nextStatus !== "in_progress") return null;
  if (currentStatus === "in_progress") return null; // not a real transition
  if (currentAssigneeId) return null; // respect an existing assignee
  if (!resolveAutoAssignOnStart(meta)) return null;
  return userId;
}
