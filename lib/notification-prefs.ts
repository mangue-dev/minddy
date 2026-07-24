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
export const NOTIF_FEEDBACK_META_KEY = "notif_feedback";

/** One toggle per trigger family — finer grain would just be noise to manage. */
export type NotificationCategory =
  | "assigned"
  | "mention"
  | "comment"
  | "agent"
  | "feedback";

export interface NotificationPrefs {
  assigned: boolean;
  mention: boolean;
  comment: boolean;
  agent: boolean;
  feedback: boolean;
}

export const NOTIFICATION_CATEGORY_META_KEYS: Record<NotificationCategory, string> = {
  assigned: NOTIF_ASSIGNED_META_KEY,
  mention: NOTIF_MENTION_META_KEY,
  comment: NOTIF_COMMENT_META_KEY,
  agent: NOTIF_AGENT_META_KEY,
  feedback: NOTIF_FEEDBACK_META_KEY,
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
    feedback: meta?.[NOTIF_FEEDBACK_META_KEY] !== false,
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
      return "agent";
    case "feedback_new":
      return "feedback";
  }
}
