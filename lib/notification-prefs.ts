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
 *  Order = the settings UI's, and the one Numo's tool schema advertises.
 *
 *  Les ROUTINES et les PULL REQUESTS ont la leur depuis qu'elles annoncent autre
 *  chose que des runs : une routine tourne toute seule tous les matins, et une
 *  pull request qui s'ouvre concerne tout le projet, Numo ou pas. Les laisser
 *  sous « agent » revenait à ne pouvoir couper le bruit qu'en coupant aussi les
 *  questions que Numo pose. */
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
    // Une chaîne d'automatisation, c'est Numo qui travaille : même bascule que
    // ses runs, plutôt qu'une catégorie de plus à gérer pour rien.
    case "automation_paused":
    case "automation_stopped":
      return "agent";
    case "routine_done":
      return "routine";
    // Toute la vie d'une pull request sous la même bascule — ouverte, relue,
    // fusionnée. Une seule des trois sous un autre interrupteur serait un piège :
    // on coupe « les pull requests » et il en reste.
    case "pr_opened":
    case "pr_reviewed":
    case "pr_merged":
      return "pullRequest";
    case "feedback_new":
      return "feedback";
    // Les deux signaux du WIKI sous la même bascule (MIN-278) : être cité dans
    // une page et voir l'agent y écrire sont le même sujet — « ce qui bouge
    // dans les pages ». La mention de page ne rejoint PAS « Mentions », qui
    // parle des tickets, ni l'écriture d'agent « Numo », qui parle des runs :
    // couper l'un pour l'autre serait couper deux fois trop.
    case "page_mention":
    case "page_agent_edit":
      return "page";
  }
}

/**
 * La bascule qui gouverne une notification — le type NE SUFFIT PAS.
 *
 * Une routine annonce la fin de ses passages avec les types de l'agent
 * (`agent_done` quand elle a ouvert une pull request, `agent_failed` quand elle
 * s'est arrêtée) : seul `routine_id` distingue son passage du run qu'on a lancé
 * à la main. Sans ce détour, couper « Routines » aurait laissé passer l'échec du
 * lendemain matin — la moitié de ce qu'on voulait couper.
 */
export function categoryOfNotification(n: {
  type: NotificationType;
  routine_id?: string | null;
}): NotificationCategory {
  if (n.routine_id) return "routine";
  return categoryOfNotificationType(n.type);
}
