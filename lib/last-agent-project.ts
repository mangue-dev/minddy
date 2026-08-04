"use client";

/**
 * Le projet dans lequel l'utilisateur a lancé l'agent la dernière fois, retenu
 * par navigateur.
 *
 * Il pré-remplit le composer d'une conversation SANS ticket, où le projet est
 * le seul choix obligatoire (c'est son dépôt que l'agent clone) : « là où je
 * fais travailler l'agent » vaut mieux que « celui qui trie en premier ».
 *
 * Mémoire DISTINCTE de celle du dialog de création ([[last-create-project]]) :
 * la règle de repli est la même, le geste non — on ne dépose pas forcément ses
 * tickets là où on lance l'agent, et écrire l'un dans l'autre déplacerait le
 * défaut d'un dialog qui n'a rien demandé.
 *
 * Local à l'appareil comme les brouillons et les vues de board — une
 * préférence, pas une donnée, donc aucun aller-retour serveur. Une valeur
 * absente ou périmée retombe simplement sur le repli, et l'appelant valide
 * toujours l'id contre les projets courants (le projet a pu être supprimé, ou
 * l'accès perdu).
 */

const KEY = "minddy:last-agent-project";

/** Retient un lancement réussi. */
export function rememberAgentProject(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, projectId);
  } catch {
    /* localStorage indisponible (navigation privée / désactivé) — on ignore. */
  }
}

/** Le projet retenu, ou `null` s'il n'y en a pas. */
export function lastAgentProjectId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Sur quel projet le composer s'ouvre : le dernier où un agent a été lancé,
 * tant qu'il est encore dans la liste de l'utilisateur, sinon le premier — et
 * celui-là n'est pas arbitraire, la liste arrive triée par `updated_at`, donc
 * c'est le projet touché le plus récemment. Pure (l'appelant passe l'id retenu
 * via {@link lastAgentProjectId}), donc testable.
 */
export function defaultAgentProjectId(
  projects: readonly { id: string }[],
  lastId: string | null
): string | null {
  if (lastId && projects.some((p) => p.id === lastId)) return lastId;
  return projects[0]?.id ?? null;
}
