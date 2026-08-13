/**
 * LES NOMS des tools de PLATEFORME — ticket, carnet, pull request.
 *
 * Trois `Set`, et rien d'autre. Ils vivaient dans les modules qui EXÉCUTENT ces
 * tools (`issue-tools.ts`, `scratchpad-tools.ts`, `pr-tools.ts`), lesquels
 * touchent la base et la forge. Or depuis MIN-224 c'est le ROUTAGE — « ce nom
 * est-il un tool de plateforme ? » — qui descend dans la microVM avec la boucle,
 * pas l'exécution. Un routeur qui importe ses exécuteurs pour connaître leurs
 * noms emmènerait `getServiceClient` dans un process où le modèle lance du shell.
 *
 * Les trois modules d'exécution les RÉ-EXPORTENT : aucun appelant existant ne
 * change, et il n'y a toujours qu'une seule liste par famille.
 */

/** Tools ticket (routés vers `issue-tools.ts`). */
export const ISSUE_TOOL_NAMES = new Set([
  "search_issues",
  "read_issue",
  "read_resource",
  // Le nom d'avant MIN-184, gardé POUR L'EXÉCUTION seule : il n'est plus servi
  // dans la liste des tools, mais un checkpoint repris rejoue l'ancien appel.
  "read_attachment",
  "read_feedback",
  "update_issue",
  "write_issue_plan",
  "append_to_plan",
  "edit_issue_text",
  "create_issue",
  "create_routine",
  "report_verdict",
  // Les PAGES du projet (MIN-273) — le wiki. Elles voyagent avec les tickets
  // parce qu'elles ont exactement le même contexte, le projet du run et son
  // acteur : une famille de plus dans le routage n'aurait apporté que du
  // câblage. L'exécution vit dans `page-tools.ts`, à côté de `issue-tools.ts`.
  "list_pages",
  "search_pages",
  "read_page",
  "create_page",
  "update_page",
  "append_to_page",
  "edit_page_text",
  // Les OBJECTIFS du projet (MIN-287) — le but auquel sert le ticket. Ils
  // voyagent avec les tickets pour la même raison que les pages : même
  // contexte, le projet du run et son acteur. L'exécution vit dans
  // `objective-tools.ts`.
  "list_objectives",
  "read_objective",
  "create_objective",
  "update_objective",
  "comment_objective",
]);

/** Tools carnet (routés vers `scratchpad-tools.ts`). */
export const SCRATCHPAD_TOOL_NAMES = new Set([
  "read_scratchpad",
  "add_scratchpad_tasks",
  "update_scratchpad_task",
  "set_scratchpad",
]);

/** Écritures sur la pull request relue (routées vers `pr-tools.ts`). */
export const PR_TOOL_NAMES = new Set(["comment_pr_line", "comment_pr", "reply_pr_thread"]);

/**
 * Pull requests DU PROJET (routées vers `project-pr-tools.ts`) — l'inventaire et
 * ce qu'un run ordinaire peut y faire, celle du run relue mise à part.
 *
 * Deux familles et pas une, alors qu'elles se recouvrent en partie : ces
 * tools-là prennent un `pull_request` (aucune session n'est ancrée pour eux),
 * et surtout ils ne sont JAMAIS servis ensemble — la relecture a les trois
 * ci-dessus, tout le reste a ceux-ci. Des noms distincts sont ce qui rend le
 * routage lisible des deux côtés (`control-plane.ts`, `exec-tool.ts`).
 */
export const PROJECT_PR_TOOL_NAMES = new Set([
  "list_pull_requests",
  "read_pull_request",
  "comment_pull_request",
  "comment_pull_request_line",
  "reply_pull_request_thread",
  "review_pull_request",
  "set_pull_request_state",
]);
