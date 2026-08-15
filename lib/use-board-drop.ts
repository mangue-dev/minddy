"use client";

/**
 * L'état de glisser d'un board : le paquet en cours, et le repère qui dit où il
 * se posera.
 *
 * Les deux boards (projet et cross-projet) en partagent la totalité, et c'est le
 * point : **le repère affiché et l'écriture qui suit sortent du même calcul.**
 * `plan()` sert aux deux — à chaque mouvement pour dessiner le trait, une
 * dernière fois au dépôt pour écrire. Un repère qui mentirait sur l'arrivée
 * serait pire que pas de repère du tout.
 *
 * `now` est figé à la prise de la carte, pas relu à chaque appel : hors tri
 * manuel, la position écrite est un horodatage (cf. `planBoardMove`), et deux
 * horodatages différents entre l'aperçu et le dépôt pourraient ranger la carte à
 * deux places différentes dans une colonne triée par priorité.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import type { IssueStatus, StatusMeta } from "@/lib/issue-constants";
import type { Issue } from "@/lib/types";
import {
  dragBundle,
  planBoardMove,
  previewBoardMove,
  readDropTarget,
  sameDropPreview,
  type DropPreview,
  type PlannedMove,
} from "@/lib/board-drag";

type BoardDragEvent = Pick<
  DragMoveEvent | DragOverEvent | DragEndEvent,
  "active" | "over"
>;

export interface BoardDrop {
  /** Le repère de dépôt, ou `null` quand le geste n'écrirait rien. */
  preview: DropPreview | null;
  /** Le paquet embarqué par le glisser en cours (cartes estompées). */
  draggingIds: Set<string>;
  /** Le ticket tenu au curseur, `null` hors glisser. */
  activeId: string | null;
  start: (event: Pick<DragStartEvent, "active">) => void;
  /** À chaque mouvement : recalcule le repère, ne re-rend que s'il a bougé. */
  track: (event: BoardDragEvent) => void;
  /** Les déplacements à écrire pour ce geste (`null` = rien à faire). */
  plan: (event: BoardDragEvent) => { status: IssueStatus; moves: PlannedMove[] } | null;
  end: () => void;
}

export function useBoardDrop({
  columns,
  comparator,
  manual,
  issueMap,
  selectedIds,
  rank,
  crossColumnOnly = false,
}: {
  /** Les colonnes telles qu'affichées — l'ordre lu est celui de l'écran. */
  columns: { status: StatusMeta; items: Issue[] }[];
  /** Le tri d'affichage des colonnes (celui qui a produit `items`). */
  comparator: (a: Issue, b: Issue) => number;
  /** Tri manuel : le seul cas où l'ordre DANS une colonne se réordonne. */
  manual: boolean;
  issueMap: Map<string, Issue>;
  selectedIds: Set<string>;
  /** Rang d'affichage de chaque ticket (`displayRank`). */
  rank: Map<string, number>;
  /** Vue de cycle : l'ordre de reco est le seul, un ticket déjà dans la colonne
      cible n'y bouge pas — seul le changement de statut passe. */
  crossColumnOnly?: boolean;
}): BoardDrop {
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const nowRef = useRef(0);

  const itemsByStatus = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    for (const column of columns) map.set(column.status.value, column.items);
    return map;
  }, [columns]);

  const plan = useCallback(
    (event: BoardDragEvent) => {
      // Lâcher une carte sur elle-même n'écrit rien — et ne montre donc rien.
      if (!event.over || String(event.over.id) === String(event.active.id)) {
        return null;
      }
      const target = readDropTarget({
        overId: event.over.id,
        overRect: event.over.rect,
        activeRect: event.active.rect.current.translated,
        issueById: issueMap,
      });
      if (!target) return null;
      const bundle = dragBundle(
        String(event.active.id),
        selectedIds,
        issueMap,
        rank
      );
      if (bundle.length === 0) return null;
      const items = itemsByStatus.get(target.status) ?? [];
      const moves = planBoardMove({
        bundle: crossColumnOnly
          ? bundle.filter((issue) => issue.status !== target.status)
          : bundle,
        targetStatus: target.status,
        overIssueId: target.overIssueId,
        dropAfter: target.after,
        // Le calcul de position veut la colonne triée PAR POSITION, et l'ordre
        // affiché ne l'est pas toujours : en vue de cycle, il vient du
        // comparateur de reco alors que `sort` reste « manuel ». Les deux
        // coïncident partout ailleurs, la copie ne coûte donc rien.
        columnItems: manual
          ? [...items].sort((a, b) => a.position - b.position)
          : items,
        manual,
        now: nowRef.current,
      });
      return moves.length > 0 ? { status: target.status, moves } : null;
    },
    [crossColumnOnly, issueMap, itemsByStatus, manual, rank, selectedIds]
  );

  const track = useCallback(
    (event: BoardDragEvent) => {
      const planned = plan(event);
      const next = planned
        ? previewBoardMove({
            moves: planned.moves,
            displayItems: itemsByStatus.get(planned.status) ?? [],
            comparator,
          })
        : null;
      setPreview((current) => (sameDropPreview(current, next) ? current : next));
    },
    [comparator, itemsByStatus, plan]
  );

  const start = useCallback(
    (event: Pick<DragStartEvent, "active">) => {
      const id = String(event.active.id);
      nowRef.current = Date.now();
      setActiveId(id);
      setDraggingIds(
        new Set(dragBundle(id, selectedIds, issueMap, rank).map((i) => i.id))
      );
      setPreview(null);
    },
    [issueMap, rank, selectedIds]
  );

  const end = useCallback(() => {
    setActiveId(null);
    setDraggingIds(new Set());
    setPreview(null);
  }, []);

  return { preview, draggingIds, activeId, start, track, plan, end };
}
