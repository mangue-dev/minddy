/**
 * Ce qu'une notification DIT — de quoi on parle, et qui a fait quoi (MIN-291).
 *
 * Ces deux phrases existaient déjà en deux exemplaires : dans la page d'inbox
 * (app/(app)/inbox/page.tsx) et dans la fabrique de charge utile poussée
 * (lib/server/push/payload.ts), qui prend soin de dire qu'elle réutilise les
 * clés de l'inbox « pour ne pas les laisser diverger ». L'app de bureau en
 * aurait fait un troisième — d'où l'extraction ici, du côté où les deux
 * surfaces clientes peuvent la lire.
 *
 * Module PUR : les libellés traduits entrent en PARAMÈTRES. C'est ce qui le rend
 * lisible depuis une notification native (qui n'a pas de contexte React sous la
 * main au moment où elle se construit) comme depuis un composant.
 */

import { mcpActorLabel } from "./mcp-agents";
import type { MyNotification } from "./types";

/** Les quelques mots traduits dont la ligne a besoin. */
export interface NotificationLabels {
  /** `Inbox.someone` — quand on ne sait vraiment pas qui a agi. */
  someone: string;
  /** `Timeline.mcpFallback` — un agent MCP dont la clé ne porte pas de nom. */
  mcpFallback: string;
  /** `Inbox.somePageFallback` — une page sans titre en a quand même un. */
  somePageFallback: string;
  /** `Inbox.someIssueFallback`, déjà formaté avec le mot « ticket » / « issue ». */
  someIssueFallback: string;
}

/**
 * Qui a agi, dans les termes de la timeline : une action passée par le MCP est
 * celle de l'AGENT, une affectation automatique celle de Smart Assign — jamais
 * « Quelqu'un », qui ne renseigne personne.
 */
export function notificationActor(
  n: MyNotification,
  labels: NotificationLabels
): string {
  if (n.via_smart_assign) return "Smart Assign";
  if (n.via_mcp) {
    return mcpActorLabel(n.api_key_agent, n.api_key_name, labels.mcpFallback);
  }
  return n.actor_name ?? labels.someone;
}

/**
 * De quoi on parle : le titre de la cible. L'ordre suit celui de
 * `notificationTargetPath` — une ligne ne porte qu'une cible, mais rien dans le
 * schéma ne l'impose, et les deux fonctions doivent en désigner la même.
 */
export function notificationTitle(
  n: MyNotification,
  labels: NotificationLabels
): string {
  if (n.objective_id) return n.objective_name ?? "";
  if (n.feedback_post_id) return n.feedback_title ?? "";
  // Une routine (MIN-185) : son titre EST la ligne — elle n'a pas de ticket à
  // nommer, et le repli « un ticket » mentirait sur ce qui s'est passé.
  if (n.routine_id) return n.routine_title ?? "";
  // Une pull request : son titre, précédé de son numéro par la référence
  // affichée à côté — elle n'a pas forcément de ticket à nommer.
  if (n.pull_request_id) return n.pull_request_title ?? "";
  // Une PAGE du wiki (MIN-278) : son titre, et le repli explicite quand elle
  // n'en a pas — une ligne sans titre ne dit plus de quoi on parle.
  if (n.page_id) return n.page_title || labels.somePageFallback;
  return n.issue_title ?? labels.someIssueFallback;
}
