import "server-only";

/**
 * Ce que lisent les routes `resources` d'une entité : la ligne entière, plus la
 * PAGE qu'elle référence quand c'en est une (MIN-275).
 *
 * Le titre d'une page n'est pas stocké dans la ressource — il est résolu à la
 * lecture, exactement comme le fait le bloc sous-page d'un document
 * (components/pages/pages-lookup.tsx). Sans ça, renommer une page laisserait son
 * ancien nom sur tous les tickets qui la citent. Une jointure SERVEUR plutôt
 * qu'une requête client de plus : la sidebar d'un ticket n'a aucune raison de
 * charger l'arbre des pages du projet pour afficher une pilule.
 *
 * Lu avec le client de SESSION, donc sous la policy `pages_select`, qui exclut
 * les pages corbeillées : une page à la corbeille redescend `page: null`, et
 * c'est ce qui rend la pilule inerte sans qu'aucun code ne s'occupe de la
 * corbeille.
 */
export const RESOURCE_SELECT = "*, page:pages(id, title, icon)";

/** La page jointe d'une ligne de ressource. */
export interface JoinedPage {
  id: string;
  title: string;
  icon?: string | null;
  /** Présent quand la lecture est faite en clé SERVICE, qui ignore la policy
      excluant les corbeillées : c'est alors la seule façon de les distinguer. */
  deleted_at?: string | null;
}

/**
 * La page jointe, quelle que soit la forme sous laquelle elle arrive.
 *
 * `page_id` est une clé étrangère simple, donc PostgREST rend un OBJET — mais
 * sans types de schéma générés, postgrest-js type tout embed comme un tableau.
 * Ce normaliseur évite d'écrire le même `as unknown as` dans les quatre
 * lecteurs (routes, issue-reads, MCP, agent), avec le risque qu'un seul se
 * trompe le jour où PostgREST rendrait vraiment une liste.
 */
export function joinedPage(value: unknown): JoinedPage | null {
  if (!value) return null;
  const row = Array.isArray(value) ? (value[0] ?? null) : value;
  return (row as JoinedPage | null) ?? null;
}
