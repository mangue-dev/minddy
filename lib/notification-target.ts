// Où mène une notification, et par quelle phrase elle se dit (MIN-183).
//
// Les deux vivaient dans la page d'inbox, et n'y avaient plus leur place à
// partir du moment où une notification se lit AUSSI hors de l'app : le service
// worker ouvre une URL sur un clic, et la charge utile poussée porte déjà la
// phrase. Les laisser là aurait voulu dire les réécrire à l'identique côté
// serveur — c'est-à-dire les laisser diverger.
//
// Module PUR (pas de `server-only`, pas de React) : la page le lit, la fabrique
// de charge utile aussi.

import type { NotificationType } from "./types";
import type { MessageKey } from "./i18n-keys";

/** La cible d'une notification, réduite à ce qui décide de sa destination. */
export interface NotificationTarget {
  project_id: string | null;
  issue_id: string | null;
  objective_id?: string | null;
  feedback_post_id?: string | null;
}

/**
 * Le chemin qu'ouvre une notification, ou `null` quand elle ne mène nulle part
 * (pas de projet : une ligne dont le projet a été supprimé).
 *
 * L'ORDRE compte et n'est pas arbitraire : une ligne ne porte qu'une cible, mais
 * rien dans le schéma ne l'impose, et l'objectif passe avant le ticket parce
 * qu'une notification d'objectif peut porter un `issue_id` de contexte.
 */
export function notificationTargetPath(n: NotificationTarget): string | null {
  if (!n.project_id) return null;
  if (n.objective_id) {
    return `/projects/${n.project_id}/objectives?open=${n.objective_id}`;
  }
  if (n.feedback_post_id) {
    return `/projects/${n.project_id}/feedback?post=${n.feedback_post_id}`;
  }
  if (n.issue_id) return `/projects/${n.project_id}?issue=${n.issue_id}`;
  return null;
}

/** La clé i18n de la phrase « qui a fait quoi », namespace `Inbox`. Typée en
 *  `MessageKey` et non en `string` : une clé retirée du catalogue ne compile
 *  plus, au lieu de s'afficher en « Inbox.… » à l'écran. */
export const NOTIFICATION_LINE_KEYS: Record<
  NotificationType,
  MessageKey<"Inbox">
> = {
  assigned: "lineAssigned",
  mention: "lineMention",
  comment: "lineComment",
  agent_done: "lineAgentDone",
  agent_question: "lineAgentQuestion",
  agent_failed: "lineAgentFailed",
  feedback_new: "lineFeedbackNew",
  pr_reviewed: "linePrReviewed",
  pr_merged: "linePrMerged",
  automation_paused: "lineAutomationPaused",
  automation_stopped: "lineAutomationStopped",
};
