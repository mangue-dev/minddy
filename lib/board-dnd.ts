/**
 * Les deux réglages dnd-kit que les deux boards partagent : QUI est survolé, et
 * ce que les cartes ont le droit d'animer.
 *
 * ## `boardCollision` — le pointeur choisit la colonne, la colonne choisit la carte
 *
 * `closestCorners` (le réglage d'avant) mesure des coins : au milieu d'un board,
 * les coins d'une carte de la colonne VOISINE peuvent être plus proches que ceux
 * de la carte qu'on survole, et le survol part à côté. Pire, entre deux cartes
 * ou sous la dernière, c'est le grand rectangle de la colonne qui gagne — la
 * cible retombe alors en fin de colonne, et le repère de dépôt fait un bond.
 *
 * D'où trois temps, dans cet ordre :
 *
 * 1. une carte sous le pointeur → c'est elle, sans discussion ;
 * 2. sinon la colonne sous le pointeur, et dans CETTE colonne seulement, la carte
 *    au centre le plus proche (le vide entre deux cartes, ou sous la dernière,
 *    désigne donc sa voisine — et `readDropTarget` dit ensuite de quel côté) ;
 * 3. pointeur hors de toute colonne (gouttière, en-têtes) → `closestCorners`, qui
 *    répond toujours quelque chose.
 *
 * ## `NO_SHIFT_STRATEGY` — une seule animation par déplacement
 *
 * Les cartes ne se décalent plus sous le paquet glissé. Ce décalage était la
 * moitié d'un doublon : dnd-kit poussait les cartes par `transform` pendant le
 * glisser, puis le cache optimiste réordonnait la liste au dépôt — deux
 * animations pour un seul déplacement, d'où les sursauts à l'arrivée. Et ce
 * décalage MENTAIT dès que la colonne était triée par priorité ou par date : il
 * ouvrait un trou sous le curseur, là où le tri n'allait rien mettre.
 *
 * Ce qu'on voit à la place, c'est le repère de dépôt
 * (`components/board-drop-indicator.tsx`), calculé par le même code que
 * l'écriture qui suit (`previewBoardMove`).
 */

import {
  closestCenter,
  closestCorners,
  pointerWithin,
  type CollisionDetection,
} from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";
import { STATUSES } from "@/lib/issue-constants";

const STATUS_IDS = new Set<string>(STATUSES.map((s) => s.value));

/** La colonne d'une carte, posée sur son sortable pour que la détection la lise. */
export interface CardDragData {
  columnStatus: string;
}

export const boardCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const card = within.find((c) => !STATUS_IDS.has(String(c.id)));
  if (card) return [card];

  const column = within.find((c) => STATUS_IDS.has(String(c.id)));
  // Les algorithmes de dnd-kit rendent TOUTES les cibles, triées ; seule la
  // première compte (`getFirstCollision`). On ne rend donc qu'elle — ce qu'on
  // rend ici est ce que le repère de dépôt lira.
  if (!column) return closestCorners(args).slice(0, 1);

  const cards = args.droppableContainers.filter(
    (c) =>
      !STATUS_IDS.has(String(c.id)) &&
      (c.data.current as CardDragData | undefined)?.columnStatus ===
        String(column.id)
  );
  if (cards.length === 0) return [column];
  const closest = closestCenter({ ...args, droppableContainers: cards });
  return closest.length > 0 ? [closest[0]] : [column];
};

/** Aucune carte ne bouge pendant le glisser (cf. l'en-tête de ce fichier). */
export const NO_SHIFT_STRATEGY: SortingStrategy = () => null;

/**
 * Et aucune ne rejoue son trajet APRÈS le dépôt : le cache optimiste l'a déjà
 * replacée. C'était la seconde moitié du doublon — et, accessoirement, ce qui
 * faisait mesurer un rectangle par carte à chaque changement de liste.
 */
export const NO_LAYOUT_ANIMATION = () => false;
