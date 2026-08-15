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
 *
 * Et une troisième, qui n'est pas du calcul de position mais son pendant à
 * l'écran : **on montre le point d'arrivée, on ne le devine pas.** `previewBoardMove`
 * dérive le repère de dépôt des déplacements DÉJÀ planifiés, puis rejoue le tri
 * d'affichage de la colonne cible. Le trait qu'on voit pendant le glisser est donc
 * calculé par le même code que l'écriture qui suit — y compris quand la colonne
 * est triée par priorité ou par date, où la carte n'atterrit pas sous le curseur
 * mais là où le tri la met.
 */

import { STATUSES, type IssueStatus } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

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

/** Le rectangle d'un élément du glisser, réduit à ce que le point d'insertion lit. */
export interface DragRect {
  top: number;
  height: number;
}

/** Où le dépôt atterrirait, tel que le geste en cours le désigne. */
export interface DropTarget {
  status: IssueStatus;
  /** La carte survolée, `null` quand c'est le fond de la colonne. */
  overIssueId: string | null;
  /** Le point d'insertion est APRÈS la carte survolée, et non avant. */
  after: boolean;
}

/**
 * Ce que le geste désigne : une colonne, une carte, et de quel côté de cette
 * carte.
 *
 * **Le côté est la moitié qui manquait.** Sans lui, survoler une carte veut
 * toujours dire « avant elle » — la dernière place d'une colonne devient
 * inatteignable autrement qu'en visant le vide sous la dernière carte, et le
 * repère de dépôt saute d'un cran par rapport à ce que la main vise. On compare
 * donc les CENTRES : celui de la carte tenue (le rectangle d'origine translaté
 * par le glisser, ce que dnd-kit appelle `active.rect.current.translated`) contre
 * celui de la carte survolée.
 */
export function readDropTarget({
  overId,
  overRect,
  activeRect,
  issueById,
}: {
  overId: string | number | null | undefined;
  overRect: DragRect | null | undefined;
  activeRect: DragRect | null | undefined;
  issueById: Map<string, Issue>;
}): DropTarget | null {
  if (overId == null) return null;
  const id = String(overId);
  if (STATUS_IDS.has(id)) {
    return { status: id as IssueStatus, overIssueId: null, after: false };
  }
  const over = issueById.get(id);
  if (!over) return null;
  const after =
    !!activeRect &&
    !!overRect &&
    activeRect.top + activeRect.height / 2 >= overRect.top + overRect.height / 2;
  return { status: over.status, overIssueId: over.id, after };
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
  dropAfter = false,
  columnItems,
  manual,
  now,
}: {
  /** Le paquet glissé, dans l'ordre où il doit atterrir. */
  bundle: Issue[];
  targetStatus: IssueStatus;
  /** La carte survolée au dépôt, `null` si on a lâché sur le fond de la colonne. */
  overIssueId: string | null;
  /** Le dépôt vise la moitié BASSE de la carte survolée : on insère après elle
      (cf. `readDropTarget`). Sans ça, la fin d'une colonne est inatteignable. */
  dropAfter?: boolean;
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
  let index: number;
  if (overIndex < 0) {
    index = rest.length;
  } else {
    const before = columnItems
      .slice(0, overIndex)
      .filter((i) => !movingIds.has(i.id)).length;
    // « Après » n'a de sens que si la carte survolée reste en place : une carte
    // du paquet ne compte pas comme voisine, elle part avec lui.
    index = before + (dropAfter && !movingIds.has(overIssueId!) ? 1 : 0);
  }

  const positions = spreadPositions(rest[index - 1], rest[index], moving.length);
  return moving.map((issue, k) => ({
    issue,
    patch:
      issue.status === targetStatus
        ? { position: positions[k] }
        : { status: targetStatus, position: positions[k] },
  }));
}

/** Le repère de dépôt à dessiner : un trait, dans une colonne, à une place. */
export interface DropPreview {
  status: IssueStatus;
  /** Le trait se dessine AVANT cette carte ; `null` = en fin de colonne. */
  beforeIssueId: string | null;
  /** Combien de tickets atterriront là (le paquet). */
  count: number;
}

/**
 * Où le paquet va se poser, tel que la colonne l'AFFICHERA.
 *
 * On ne redéduit rien du curseur : on applique les patchs déjà planifiés à une
 * copie de la colonne cible, on rejoue son tri d'affichage, et on lit la place
 * obtenue. C'est ce qui rend le repère juste dans une colonne triée par priorité
 * ou par date, où le point de chute ne doit rien au curseur — le ticket y tombe
 * là où le champ le range, parfois à dix cartes du point visé.
 *
 * Le trait s'ancre sur une carte QUI RESTE : sous tri manuel, le paquet est
 * encore affiché dans la colonne pendant le glisser, et s'ancrer sur lui ferait
 * courir le repère derrière sa propre cible.
 *
 * `null` = rien à montrer, parce qu'il n'y a rien à écrire (dépôt sans effet).
 */
export function previewBoardMove({
  moves,
  displayItems,
  comparator,
}: {
  /** Les déplacements planifiés par `planBoardMove` — vides, il n'y a pas de repère. */
  moves: PlannedMove[];
  /** La colonne cible telle qu'elle est affichée (donc déjà triée pour l'écran). */
  displayItems: Issue[];
  /** Le tri d'affichage de cette colonne. */
  comparator: (a: Issue, b: Issue) => number;
}): DropPreview | null {
  if (moves.length === 0) return null;
  const movingIds = new Set(moves.map((m) => m.issue.id));
  const status = moves[0].patch.status ?? moves[0].issue.status;
  const rest = displayItems.filter((i) => !movingIds.has(i.id));
  // Le tri est stable : à valeur égale, une carte en place garde le pas sur une
  // carte qui arrive — le repère se pose donc APRÈS ses ex æquo, comme le tri.
  const projected = [
    ...rest,
    ...moves.map((m) => ({ ...m.issue, ...m.patch }) as Issue),
  ].sort(comparator);

  const landing = projected.findIndex((i) => movingIds.has(i.id));
  if (landing < 0) return null;
  const restBefore = projected
    .slice(0, landing)
    .filter((i) => !movingIds.has(i.id)).length;
  return {
    status,
    beforeIssueId: rest[restBefore]?.id ?? null,
    count: moves.length,
  };
}

/** Deux repères identiques — pour ne re-rendre le board que quand il bouge. */
export function sameDropPreview(
  a: DropPreview | null,
  b: DropPreview | null
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.beforeIssueId === b.beforeIssueId &&
    a.count === b.count
  );
}
