// Account preferences for the Inbox (MIN-82): which triggers actually produce
// a notification. Stored in the account's Supabase auth `user_metadata`, same
// mechanism as cycle-prefs: one key per knob, resolved with a default so an
// untouched account gets everything on. Server-safe: no React import — the
// insert-time filter in lib/server/notifications.ts uses the same resolver as
// the settings UI.

import type { NotificationType } from "./types";

export const NOTIF_ASSIGNED_META_KEY = "notif_assigned";
export const NOTIF_MENTION_META_KEY = "notif_mention";
export const NOTIF_COMMENT_META_KEY = "notif_comment";
export const NOTIF_AGENT_META_KEY = "notif_agent";
export const NOTIF_ROUTINE_META_KEY = "notif_routine";
export const NOTIF_PULL_REQUEST_META_KEY = "notif_pull_request";
export const NOTIF_FEEDBACK_META_KEY = "notif_feedback";
export const NOTIF_PAGE_META_KEY = "notif_page";

/** One toggle per trigger family — finer grain would just be noise to manage.
 * Order = the settings UI's, and the one Numo's tool schema advertises.
 *
 * ROUTINES and PULL REQUESTS have their own since they advertise something else
 * something other than runs: a routine runs by itself every morning, and a pull request that opens concerns the entire project, Numo or not. Leaving them
 * under “agent” meant being able to cut through the noise only by also cutting out the
 * questions that Numo asks. */
export const NOTIFICATION_CATEGORIES = [
  "assigned",
  "mention",
  "comment",
  "agent",
  "routine",
  "pullRequest",
  "feedback",
  "page",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPrefs {
  assigned: boolean;
  mention: boolean;
  comment: boolean;
  agent: boolean;
  routine: boolean;
  pullRequest: boolean;
  feedback: boolean;
  page: boolean;
}

export const NOTIFICATION_CATEGORY_META_KEYS: Record<NotificationCategory, string> = {
  assigned: NOTIF_ASSIGNED_META_KEY,
  mention: NOTIF_MENTION_META_KEY,
  comment: NOTIF_COMMENT_META_KEY,
  agent: NOTIF_AGENT_META_KEY,
  routine: NOTIF_ROUTINE_META_KEY,
  pullRequest: NOTIF_PULL_REQUEST_META_KEY,
  feedback: NOTIF_FEEDBACK_META_KEY,
  page: NOTIF_PAGE_META_KEY,
};

/** Read the notification preferences from a user's auth user_metadata; only an
 *  explicit `false` disables a category. */
export function resolveNotificationPrefs(
  meta: Record<string, unknown> | null | undefined
): NotificationPrefs {
  return {
    assigned: meta?.[NOTIF_ASSIGNED_META_KEY] !== false,
    mention: meta?.[NOTIF_MENTION_META_KEY] !== false,
    comment: meta?.[NOTIF_COMMENT_META_KEY] !== false,
    agent: meta?.[NOTIF_AGENT_META_KEY] !== false,
    routine: meta?.[NOTIF_ROUTINE_META_KEY] !== false,
    pullRequest: meta?.[NOTIF_PULL_REQUEST_META_KEY] !== false,
    feedback: meta?.[NOTIF_FEEDBACK_META_KEY] !== false,
    page: meta?.[NOTIF_PAGE_META_KEY] !== false,
  };
}

/** The pref toggle governing a stored notification type. */
export function categoryOfNotificationType(
  type: NotificationType
): NotificationCategory {
  switch (type) {
    case "assigned":
      return "assigned";
    case "mention":
      return "mention";
    case "comment":
      return "comment";
    case "agent_done":
    case "agent_question":
    case "agent_failed":
    // An automation chain, Numo is working: same switch as
    // its runs, rather than one more category to manage for nothing.
    case "automation_paused":
    case "automation_stopped":
      return "agent";
    case "routine_done":
      return "routine";
    // The entire life of a pull request under the same switch — opened, reread,
    // merged. Only one of the three under another switch would be a trap:
    // we cut “pull requests” and some remains.
    case "pr_opened":
    case "pr_reviewed":
    case "pr_merged":
      return "pullRequest";
    case "feedback_new":
      return "feedback";
    // The two WIKI signals under the same flip-flop (MIN-278): be cited in
    // a page and seeing the agent write on it are the same subject — “what moves
    // in the pages”. The page mention does NOT join “Mentions”, which
    // talks about tickets, nor the “Numo” agent writing, which talks about runs:
    // cutting one for the other would be cutting twice too much.
    // The thread of a page (MIN-282) joins the other two: it is again “this
    // which moves in the pages”. Putting it under “Comments” would have liked
    // say that a toggle designed for tickets decides the wiki.
    case "page_mention":
    case "page_agent_edit":
    case "page_comment":
      return "page";
  }
}

/**
 * The toggle that governs a notification — type IS NOT ENOUGH.
 *
 * A routine announces the end of its passes with the agent's types
 * (`agent_done` when it has opened a pull request, `agent_failed` when she
 * stopped): only `routine_id` distinguishes her passage from the run that we launched
 * by hand. Without this detour, cutting “Routines” would have missed the failure of
 * the next morning — half of what we wanted to cut.
 */
export function categoryOfNotification(n: {
  type: NotificationType;
  routine_id?: string | null;
}): NotificationCategory {
  if (n.routine_id) return "routine";
  return categoryOfNotificationType(n.type);
}
