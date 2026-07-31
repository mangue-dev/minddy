/**
 * Ce qu'un compte git a le droit de faire sur un dépôt (MIN-144) — logique PURE,
 * lisible depuis la charge utile de chaque forge, testable sans réseau.
 *
 * Trois niveaux, et pas plus :
 *  • `write` — merger, fermer, proposer une PR brouillon, résoudre un fil ;
 *  • `read`  — reviewer, commenter la conversation, commenter une ligne, y
 *    répondre. Ce n'est PAS « connecté » : commenter une ligne relit la PR à
 *    chaud (côté GitHub, pour son `commitId`), donc il faut vraiment savoir lire
 *    le dépôt ;
 *  • `none`  — 404 chez la forge : le compte ne voit pas ce dépôt.
 *
 * On ne modélise pas la protection de branche : elle coûterait une permission
 * GitHub hors périmètre, la forge refuse le merge toute seule, et
 * `mergeableState === "blocked"` le dit déjà dans l'UI.
 */

export type RepoCapability = "write" | "read" | "none";

/**
 * GitHub — `GET /repos/{owner}/{repo}` avec le token UTILISATEUR. L'objet
 * `permissions` n'existe que sur une réponse authentifiée ; un dépôt public lu
 * sans droit dessus renvoie `push: false, pull: true` → `read`, ce qui est
 * exact : on peut commenter un dépôt public sans y être contributeur.
 *
 * `permissions` absent = réponse inattendue (ou dépôt lu sans auth) : on retombe
 * sur `read`, jamais sur `write` — le doute ne donne pas le droit de merger.
 */
export function githubCapabilityFromRepo(json: unknown): RepoCapability {
  const permissions = (json as { permissions?: unknown } | null)?.permissions as
    | { push?: unknown; pull?: unknown; admin?: unknown; maintain?: unknown }
    | undefined;
  if (!permissions || typeof permissions !== "object") return "read";
  if (permissions.push === true || permissions.admin === true) return "write";
  return "read";
}

/**
 * GitLab — `GET /projects/:id`. Le droit effectif est le MAX de l'accès direct
 * au projet et de l'accès hérité du groupe : un Maintainer de groupe n'a souvent
 * aucun `project_access`, et ne lire que celui-là le déclasserait à `read`.
 *
 * Seuils GitLab : 30 = Developer (peut pousser, commenter, résoudre un fil),
 * 20 = Reporter (lecture + commentaires). En dessous, rien.
 */
const GITLAB_DEVELOPER = 30;
const GITLAB_REPORTER = 20;

export function gitlabCapabilityFromProject(json: unknown): RepoCapability {
  const permissions = (json as { permissions?: unknown } | null)?.permissions as
    | {
        project_access?: { access_level?: unknown } | null;
        group_access?: { access_level?: unknown } | null;
      }
    | undefined;
  const levelOf = (entry: { access_level?: unknown } | null | undefined): number =>
    typeof entry?.access_level === "number" ? entry.access_level : 0;
  const level = Math.max(
    levelOf(permissions?.project_access),
    levelOf(permissions?.group_access),
  );
  if (level >= GITLAB_DEVELOPER) return "write";
  if (level >= GITLAB_REPORTER) return "read";
  // `permissions` absent ou vide : le projet a répondu, donc il est LISIBLE
  // (public, ou visible sans appartenance). On peut y commenter, pas y écrire.
  return "read";
}
