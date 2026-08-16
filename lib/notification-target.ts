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
  /** Conversation de l'agent de code, independante de ses contextes. */
  agent_conversation_id?: string | null;
  objective_id?: string | null;
  feedback_post_id?: string | null;
  /** Une ROUTINE (MIN-185) : ses exécutions se lisent dans la routine, et
      nulle part ailleurs — d'où une destination à elle. */
  routine_id?: string | null;
  /** Une PULL REQUEST : elle se lit sur la page Pull requests, qui est globale
      comme la vue Agents — et elle n'a pas forcément de ticket. */
  pull_request_id?: string | null;
  /** Une PAGE du wiki (MIN-278). */
  page_id?: string | null;
  /** Le BLOC visé dans cette page, quand on le connaît : la mention y a été
      posée. C'est l'ancre de `blockLink` (components/pages/block-actions.ts),
      que la page suit à l'ouverture (page-view.tsx). */
  block_id?: string | null;
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
  // La routine passe AVANT le test de projet : son écran est global (la vue
  // Agents, tous projets confondus), donc elle mène quelque part même si la
  // ligne n'a pas de projet.
  if (n.routine_id) return `/agents?tab=routines&routine=${n.routine_id}`;
  // La pull request aussi : sa page est globale, et une PR sans ticket n'a rien
  // d'autre à ouvrir — c'est même le cas normal d'une PR humaine.
  if (n.pull_request_id) return `/pull-requests?pr=${n.pull_request_id}`;
  if (n.agent_conversation_id) return `/agents?run=${n.agent_conversation_id}`;
  if (!n.project_id) return null;
  if (n.objective_id) {
    return `/projects/${n.project_id}/objectives?open=${n.objective_id}`;
  }
  if (n.feedback_post_id) {
    return `/projects/${n.project_id}/feedback?post=${n.feedback_post_id}`;
  }
  // Une PAGE (MIN-278) : elle a sa propre route, pas un paramètre sur le board.
  // Le bloc s'ajoute en FRAGMENT — il ne part pas au serveur, ne casse aucune
  // route, et c'est déjà la forme des liens de bloc (`blockLink`).
  if (n.page_id) {
    const path = `/projects/${n.project_id}/pages/${n.page_id}`;
    return n.block_id ? `${path}#${n.block_id}` : path;
  }
  if (n.issue_id) return `/projects/${n.project_id}?issue=${n.issue_id}`;
  return null;
}

/**
 * Les paramètres de requête qui IDENTIFIENT la cible dans les chemins ci-dessus,
 * par opposition à ceux qui ne font que décorer l'écran (`tab=routines`).
 *
 * Ils servent à répondre à « la page affichée est-elle celle de cette
 * notification ? », pour refermer la bannière poussée quand on y arrive
 * (lib/push/dismiss.ts). Le chemin seul n'y suffit pas : deux routines vivent
 * sur le même `/agents`, deux tickets sur le même board.
 *
 * **Une cible de plus dans `notificationTargetPath` = son paramètre ici**, sinon
 * arriver sur l'une refermerait les notifications de toutes les autres. Le test
 * de lib/push/dismiss.test.ts le vérifie cible par cible.
 *
 * Une PAGE (MIN-278) n'en a pas besoin, et c'est la seule dans ce cas : son id
 * est un SEGMENT de chemin, pas un paramètre — deux pages ne partagent jamais
 * une URL. Le fragment de bloc, lui, n'entre pas dans la comparaison : arriver
 * sur la page referme la notification, qu'on ait sauté au bon bloc ou non.
 */
export const NOTIFICATION_TARGET_PARAMS = [
  "open",
  "post",
  "issue",
  "routine",
  "pr",
  "run",
] as const;

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
  pr_opened: "linePrOpened",
  automation_paused: "lineAutomationPaused",
  automation_stopped: "lineAutomationStopped",
  routine_done: "lineRoutineDone",
  page_mention: "linePageMention",
  page_agent_edit: "linePageAgentEdit",
  page_comment: "linePageComment",
};
