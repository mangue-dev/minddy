import type { AgentAnchor } from "./prompt";

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

/**
 * L'ANCRAGE D'UN RUN, lu sur sa ligne (MIN-326).
 *
 * La même précédence qu'`execute.ts` (« `issue` ? "issue" : `prRun` ? "pr" :
 * "notebook" »), et il faut qu'elle le reste : c'est cet ancrage qui décide à la
 * fois de ce qu'on ANNONCE au modèle (`agentToolsFor`) et de ce qu'on lui SERT
 * (`runPlatformTool`). Deux réponses différentes à « quel ancrage ? » et le jeu
 * de tools annoncé cesse d'être celui qui est appliqué — précisément la
 * divergence que la table ci-dessous existe pour empêcher.
 */
export function anchorForRun(run: {
  issue_id: string | null;
  pull_request_id: string | null;
}): AgentAnchor {
  if (run.issue_id) return "issue";
  return run.pull_request_id ? "pr" : "notebook";
}

/** Tout tool de plateforme d'un run de TICKET ou de CARNET — les deux ancrages
 *  ont exactement le même jeu (cf. `AGENT_TOOLS` / `NOTEBOOK_AGENT_TOOLS`). */
const FULL_PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...ISSUE_TOOL_NAMES,
  ...SCRATCHPAD_TOOL_NAMES,
  ...PROJECT_PR_TOOL_NAMES,
  "create_pr",
  "web_search",
]);

/**
 * Ce qu'une RELECTURE de pull request peut appeler : les LECTEURS minddy, et les
 * trois écritures sur la pull request relue. Rien d'autre — pas un tool ticket,
 * pas le carnet, pas une page, pas un objectif, pas une routine, pas `create_pr`,
 * et pas `web_search` (le jeu de relecture ne l'a jamais servi).
 *
 * `read_attachment` est le nom d'avant MIN-184 de `read_resource` : il n'est plus
 * annoncé nulle part, mais un checkpoint repris rejoue l'ancien appel — il vit
 * donc partout où `read_resource` vit, ici comme dans `ISSUE_TOOL_NAMES`.
 */
const PR_REVIEW_PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_issues",
  "read_issue",
  "read_feedback",
  "read_resource",
  "read_attachment",
  "list_pages",
  "read_page",
  "list_objectives",
  "read_objective",
  ...PR_TOOL_NAMES,
]);

/**
 * LE JEU D'OUTILS EST UNE PROPRIÉTÉ DU RUN, pas une liste que le prompt est prié
 * de respecter (MIN-326).
 *
 * `runPlatformTool` routait sur le SEUL nom du tool : seules les deux familles PR
 * regardaient un ancrage. Une session de relecture — celle dont tout le dépôt
 * affirme qu'elle est en lecture seule, et la seule dont le contenu lu vient d'un
 * fork inconnu — pouvait donc appeler `update_issue`, `set_scratchpad`,
 * `create_page`, `create_routine` ou `create_pr` par un simple POST sur
 * `/api/agent-vm/tool/<nom>` depuis son shell. Une instruction glissée dans un
 * `AGENTS.md` suffisait à franchir l'ancrage, jusqu'à la ROUTINE planifiée, qui
 * donne une persistance.
 *
 * Cette table est le verrou de CODE que la doctrine n'avait qu'en prompt. Elle
 * est aussi la raison pour laquelle un tool neuf ne peut plus être ajouté sans
 * décider de son ancrage : le test de `control-plane.test.ts` la confronte, nom
 * par nom, à ce qu'`agentToolsFor` ANNONCE pour chaque ancrage — les deux ne
 * peuvent plus diverger en silence.
 */
export const PLATFORM_TOOLS_BY_ANCHOR: Record<AgentAnchor, ReadonlySet<string>> = {
  issue: FULL_PLATFORM_TOOL_NAMES,
  notebook: FULL_PLATFORM_TOOL_NAMES,
  pr: PR_REVIEW_PLATFORM_TOOL_NAMES,
};

/** TOUS les tools de plateforme, ancrages confondus — « ce nom est-il soumis à la
 *  table ? ». Un nom qui n'y est pas n'est pas de plateforme (fichier, contrôle,
 *  délégation) : son handler décide, comme avant. */
export const PLATFORM_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...FULL_PLATFORM_TOOL_NAMES,
  ...PR_REVIEW_PLATFORM_TOOL_NAMES,
]);
