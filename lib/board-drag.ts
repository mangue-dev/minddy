/**
 * Ce qu'un glisser-déposer déplace sur un board, quand une sélection est en cours.
 *
 * Deux règles, et elles tiennent en une phrase chacune :
 *
 * - **On embarque la sélection** dès que la carte saisie en fait partie. Saisir
 *   une carte HORS sélection ne déplace qu'elle — la sélection reste où elle est,
 *   comme sur un bureau : on ne perd pas trente tickets triés parce qu'on a
 *   attrapé le trente-et-unième.
 *
 * - **Le paquet garde son ordre de lecture.** Les tickets atterrissent dans
 *   l'ordre où ils étaient à l'écran (colonnes de gauche à droite, cartes de haut
 *   en bas), pas dans l'ordre où le `Set` de sélection les a rencontrés — qui,
 *   lui, dépend de l'ordre des ⇧-clics et ne veut rien dire.
 *
 * Les positions se calculent une seule fois pour tout le paquet : on découpe
 * l'intervalle entre les deux voisins du point de dépôt en autant de parts qu'il
 * y a de tickets. Les faire passer un par un par le calcul à deux voisins les
 * empilerait tous sur la même valeur.
 */

import type { IssueStatus } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

/** Rang d'affichage de chaque ticket sur le board (colonnes puis cartes). */
export function displayRank(columns: { items: Issue[] }[]): Map<string, number> {
  const rank = new Map<string, number>();
  let n = 0;
  for (const column of columns) {
    for (const issue of column.items) rank.set(issue.id, n++);
  }
  return rank;
}

/**
 * Les tickets qu'un glisser embarque : la sélection si la carte saisie en fait
 * partie, cette carte seule sinon. Rendus dans l'ordre d'affichage du board.
 */
export function dragBundle(
  activeId: string,
  selectedIds: Set<string>,
  issueById: Map<string, Issue>,
  rank: Map<string, number>
): Issue[] {
  const active = issueById.get(activeId);
  if (!active) return [];
  if (!selectedIds.has(activeId) || selectedIds.size < 2) return [active];
  const bundle = Array.from(selectedIds, (id) => issueById.get(id)).filter(
    (issue): issue is Issue => issue !== undefined
  );
  return bundle.sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  );
}

/** `count` positions réparties entre les deux voisins du point d'insertion. */
function spreadPositions(
  before: Issue | undefined,
  after: Issue | undefined,
  count: number
): number[] {
  if (!before && !after) return Array.from({ length: count }, (_, k) => k);
  if (!before) return Array.from({ length: count }, (_, k) => after!.position - count + k);
  if (!after) return Array.from({ length: count }, (_, k) => before.position + 1 + k);
  const step = (after.position - before.position) / (count + 1);
  return Array.from({ length: count }, (_, k) => before.position + step * (k + 1));
}

export interface PlannedMove {
  issue: Issue;
  patch: { status?: IssueStatus; position: number };
}

/**
 * Le déplacement à écrire pour chaque ticket du paquet. Vide = rien à faire
 * (dépôt sans effet), auquel cas l'appelant n'écrit rien du tout.
 */
export function planBoardMove({
  bundle,
  targetStatus,
  overIssueId,
  columnItems,
  manual,
  now,
}: {
  /** Le paquet glissé, dans l'ordre où il doit atterrir. */
  bundle: Issue[];
  targetStatus: IssueStatus;
  /** La carte survolée au dépôt, `null` si on a lâché sur le fond de la colonne. */
  overIssueId: string | null;
  /** La colonne cible entière, triée par position — le paquet inclus. */
  columnItems: Issue[];
  /** Tri manuel : seul cas où l'ordre dans une colonne se réordonne. */
  manual: boolean;
  /** Horodatage de base pour les tris par champ (la position y est cosmétique). */
  now: number;
}): PlannedMove[] {
  const moving = manual
    ? bundle
    : // Hors tri manuel, l'ordre d'une colonne est dérivé d'un champ : un ticket
      // déjà dans la colonne cible n'a rien à changer.
      bundle.filter((issue) => issue.status !== targetStatus);
  if (moving.length === 0) return [];

  if (!manual) {
    return moving.map((issue, k) => ({
      issue,
      patch: { status: targetStatus, position: now + k },
    }));
  }

  const movingIds = new Set(moving.map((i) => i.id));
  const rest = columnItems.filter((i) => !movingIds.has(i.id));
  // Le point d'insertion se lit sur la colonne COMPLÈTE (la carte survolée peut
  // faire partie du paquet), puis se traduit en index parmi les tickets restants.
  const overIndex = overIssueId
    ? columnItems.findIndex((i) => i.id === overIssueId)
    : -1;
  const index =
    overIndex < 0
      ? rest.length
      : columnItems.slice(0, overIndex).filter((i) => !movingIds.has(i.id)).length;

  const positions = spreadPositions(rest[index - 1], rest[index], moving.length);
  return moving.map((issue, k) => ({
    issue,
    patch:
      issue.status === targetStatus
        ? { position: positions[k] }
        : { status: targetStatus, position: positions[k] },
  }));
}
