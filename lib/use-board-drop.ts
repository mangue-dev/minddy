"use client";

/**
 * The sliding state of a board: the current package, and the mark which says where it will land.
 *
 * The two boards (project and cross-project) share the whole of it, and this is the
 * point: **the displayed mark and the writing which follows come out of the same calculation.**
 * `plan()` is used for both — at each movement to draw the line, one
 * last time at the deposit to write. A marker that lies about the arrival
 * would be worse than no marker at all.
 *
 * `now` is frozen when the card is taken, not reread at each call: excluding manual sorting
 *, the written position is a timestamp (cf. `planBoardMove`), and two
 * different timestamps between preview and repository could put the card at
 * two different places in a column sorted by priority.
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
  /** The drop mark, or `null` when the gesture would not write anything. */
  preview: DropPreview | null;
  /** The deck loaded by the current drag (cards dimmed). */
  draggingIds: Set<string>;
  /** The ticket held at the cursor, `null` excluding dragging. */
  activeId: string | null;
  start: (event: Pick<DragStartEvent, "active">) => void;
  /** On each movement: recalculates the mark, only re-renders if it has moved. */
  track: (event: BoardDragEvent) => void;
  /** The movements to write for this gesture (`null` = nothing to do). */
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
  /** The columns as displayed — the order read is that of the screen. */
  columns: { status: StatusMeta; items: Issue[] }[];
  /** The column display sort (the one that produced `items`). */
  comparator: (a: Issue, b: Issue) => number;
  /** Manual sort: the only case where the order IN a column reorders. */
  manual: boolean;
  issueMap: Map<string, Issue>;
  selectedIds: Set<string>;
  /** Rang d'affichage de chaque ticket (`displayRank`). */
  rank: Map<string, number>;
  /** Cycle view: the receipt order is the only one, a ticket already in the target column
 does not move there — only the status change passes. */
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
      // Dropping a card on itself writes nothing — and therefore shows nothing.
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
        // The position calculation wants the column sorted BY POSITION, and the order
        // displayed is not always: in cycle view, it comes from
        // reco comparator while `sort` remains “manual”. Both
        // coincide everywhere else, so the copy costs nothing.
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
