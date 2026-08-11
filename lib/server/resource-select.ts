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

/**
 * Une ressource telle qu'un AGENT la lit — trois formes, une par `kind`.
 *
 * Écrite une fois parce qu'elle est lue par plusieurs surfaces (le ticket dans
 * issue-reads, les objectifs du chat) et qu'un modèle apprend la forme qu'on
 * lui montre : deux lecteurs qui nomment le même champ `title` d'un côté et
 * `file_name` de l'autre lui font écrire deux fois du code différent pour la
 * même chose.
 *
 * Ce qui n'y est PAS, volontairement : le contenu d'un fichier. Ses octets
 * restent derrière la porte des URLs signées de l'app ; ici on ne dit que son
 * nom, son type et sa taille.
 *
 * Le titre d'une PAGE vient de la jointure, pas de la ligne : c'est ce qui fait
 * qu'une page renommée l'est aussi partout où elle est citée. `page_in_trash`
 * n'apparaît qu'en lecture SERVICE — au client de session, une page corbeillée
 * ne redescend simplement pas.
 */
export function resourceSummary(row: {
  id: unknown;
  kind: unknown;
  url?: unknown;
  page_id?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  page?: unknown;
}): Record<string, unknown> {
  if (row.kind === "link") {
    return { id: row.id, kind: "link", url: row.url, title: row.file_name };
  }
  if (row.kind === "page") {
    const page = joinedPage(row.page);
    return {
      id: row.id,
      kind: "page",
      page_id: row.page_id,
      title: page?.title?.trim() || row.file_name,
      ...(page?.deleted_at ? { page_in_trash: true } : {}),
    };
  }
  return {
    id: row.id,
    kind: "file",
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
  };
}
