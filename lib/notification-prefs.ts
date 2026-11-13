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
export const NOTIF_NUMO_META_KEY = "notif_numo";

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
  "numo",
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
  /** Notes Numo writes for the user (MIN-914). */
  numo: boolean;
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
  numo: NOTIF_NUMO_META_KEY,
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
    numo: meta?.[NOTIF_NUMO_META_KEY] !== false,
  };
}

/** The pref toggle governing a stored notification type. */
export function categoryOfNotificationType(
  type: NotificationType
): NotificationCategory | null {
  switch (type) {
    case "assigned":
    // Several assignments told in one line (MIN-903) are still assignments.
    case "smart_assign_batch":
      return "assigned";
    case "mention":
      return "mention";
    case "comment":
      return "comment";
    case "agent_question":
    case "agent_failed":
      return "agent";
    case "pr_opened":
      return "pullRequest";
    case "feedback_new":
      return "feedback";
    // The wiki signals share one switch (MIN-278, MIN-282): a mention in a
    // page and a page thread are both “what moves in the pages”, which the
    // ticket switches (Mentions, Comments) do not decide.
    case "page_mention":
    case "page_comment":
      return "page";
    // A change of the instance configuration (MIN-847) is a security notice:
    // no switch can mute it.
    case "instance_config_changed":
      return null;
    // A note Numo chose to write (MIN-914) is not a run report: it has its
    // own switch, whatever it links to.
    case "numo_message":
      return "numo";
  }
}

/**
 * The toggle that governs a notification — type IS NOT ENOUGH.
 *
 * A routine reports a failed or waiting run with the agent's types
 * (`agent_failed`, `agent_question`): only `routine_id` tells its run from
 * one launched by hand, so cutting “Routines” also cuts those.
 */
export function categoryOfNotification(n: {
  type: NotificationType;
  routine_id?: string | null;
}): NotificationCategory | null {
  // A Numo note may link to a routine without being that routine's run report.
  if (n.type === "numo_message") return "numo";
  if (n.routine_id) return "routine";
  return categoryOfNotificationType(n.type);
}
