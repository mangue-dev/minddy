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
  displayRank,
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

const CARD_SELECTOR = "[data-issue-id]";
const COLUMN_SCROLLER_SELECTOR = "[data-board-column-scroller]";

type CachedCardGeometry = {
  centerY: number;
  scrollTop: number;
  scroller: HTMLElement | null;
};

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
  plan: (
    event: BoardDragEvent,
  ) => { status: IssueStatus; moves: PlannedMove[] } | null;
  end: () => void;
}

export function useBoardDrop({
  columns,
  comparator,
  manual,
  issueMap,
  selectedIds,
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
  /** Cycle view: the receipt order is the only one, a ticket already in the target column
 does not move there — only the status change passes. */
  crossColumnOnly?: boolean;
}): BoardDrop {
  const [preview, setPreview] = useState<DropPreview | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set());
  const nowRef = useRef(0);
  const bundleRef = useRef<Issue[]>([]);
  const bundleIdsRef = useRef<Set<string>>(new Set());
  const cardNodesRef = useRef<Map<string, HTMLElement>>(new Map());
  const cardGeometryRef = useRef<Map<string, CachedCardGeometry>>(new Map());
  const planCacheRef = useRef<{
    status: IssueStatus;
    overIssueId: string | null;
    after: boolean;
    manual: boolean;
    crossColumnOnly: boolean;
    items: Issue[];
    result: { status: IssueStatus; moves: PlannedMove[] } | null;
  } | null>(null);
  const trackedPlanRef = useRef<{
    planned: object | null;
    comparator: (a: Issue, b: Issue) => number;
  } | null>(null);

  const itemsByStatus = useMemo(() => {
    const map = new Map<IssueStatus, Issue[]>();
    for (const column of columns) map.set(column.status.value, column.items);
    return map;
  }, [columns]);
  const rankById = useMemo(() => displayRank(columns), [columns]);

  const positionItemsByStatus = useMemo(() => {
    if (!manual) return itemsByStatus;
    const map = new Map<IssueStatus, Issue[]>();
    for (const [status, items] of itemsByStatus) {
      const alreadySorted = items.every(
        (issue, index) =>
          index === 0 || items[index - 1].position <= issue.position,
      );
      map.set(
        status,
        alreadySorted
          ? items
          : [...items].sort((a, b) => a.position - b.position),
      );
    }
    return map;
  }, [itemsByStatus, manual]);

  const cardCenterY = useCallback((issueId: string) => {
    const node = cardNodesRef.current.get(issueId);
    if (!node) return null;
    let cached = cardGeometryRef.current.get(issueId);
    if (!cached) {
      const rect = node.getBoundingClientRect();
      const scroller = node.closest<HTMLElement>(COLUMN_SCROLLER_SELECTOR);
      cached = {
        centerY: rect.top + rect.height / 2,
        scrollTop: scroller?.scrollTop ?? 0,
        scroller,
      };
      cardGeometryRef.current.set(issueId, cached);
    }
    return (
      cached.centerY - ((cached.scroller?.scrollTop ?? 0) - cached.scrollTop)
    );
  }, []);

  const readManualTarget = useCallback(
    (event: BoardDragEvent, status: IssueStatus) => {
      const activeRect = event.active.rect.current.translated;
      if (!activeRect) {
        return { status, overIssueId: null, after: false };
      }
      const probe = {
        x: activeRect.left + activeRect.width / 2,
        y: activeRect.top + activeRect.height / 2,
      };
      const movingIds = bundleIdsRef.current;
      const items = itemsByStatus.get(status) ?? [];
      const pointedCard =
        typeof document.elementFromPoint === "function"
          ? document
              .elementFromPoint(probe.x, probe.y)
              ?.closest<HTMLElement>(CARD_SELECTOR)
          : null;
      const pointedId = pointedCard?.dataset.issueId;
      if (
        pointedId &&
        !movingIds.has(pointedId) &&
        pointedCard.dataset.columnStatus === status
      ) {
        const center = cardCenterY(pointedId);
        return {
          status,
          overIssueId: pointedId,
          after: center != null && probe.y >= center,
        };
      }

      let lastIssueId: string | null = null;
      for (const issue of items) {
        if (movingIds.has(issue.id)) continue;
        const center = cardCenterY(issue.id);
        if (center == null) continue;
        if (probe.y < center) {
          return { status, overIssueId: issue.id, after: false };
        }
        lastIssueId = issue.id;
      }
      return {
        status,
        overIssueId: lastIssueId,
        after: lastIssueId != null,
      };
    },
    [cardCenterY, itemsByStatus],
  );

  const plan = useCallback(
    (event: BoardDragEvent) => {
      if (!event.over) return null;
      const overId = String(event.over.id);
      const targetStatus = itemsByStatus.has(overId as IssueStatus)
        ? (overId as IssueStatus)
        : null;
      const target = targetStatus
        ? manual
          ? readManualTarget(event, targetStatus)
          : { status: targetStatus, overIssueId: null, after: false }
        : readDropTarget({
            overId: event.over.id,
            overRect: event.over.rect,
            activeRect: event.active.rect.current.translated,
            issueById: issueMap,
          });
      if (!target) return null;
      const bundle = bundleRef.current;
      if (bundle.length === 0) return null;
      const items = itemsByStatus.get(target.status) ?? [];
      const cached = planCacheRef.current;
      if (
        cached?.status === target.status &&
        cached.overIssueId === target.overIssueId &&
        cached.after === target.after &&
        cached.manual === manual &&
        cached.crossColumnOnly === crossColumnOnly &&
        cached.items === items
      ) {
        return cached.result;
      }
      const moves = planBoardMove({
        bundle: crossColumnOnly
          ? bundle.filter((issue) => issue.status !== target.status)
          : bundle,
        targetStatus: target.status,
        overIssueId: target.overIssueId,
        dropAfter: target.after,
        // Cycle views can display a recommendation order while persisting a
        // manual position. That alternate order is prepared once per layout,
        // not sorted again for every pointer event.
        columnItems: positionItemsByStatus.get(target.status) ?? [],
        manual,
        now: nowRef.current,
      });
      const result = moves.length > 0 ? { status: target.status, moves } : null;
      planCacheRef.current = {
        status: target.status,
        overIssueId: target.overIssueId,
        after: target.after,
        manual,
        crossColumnOnly,
        items,
        result,
      };
      return result;
    },
    [
      crossColumnOnly,
      issueMap,
      itemsByStatus,
      manual,
      positionItemsByStatus,
      readManualTarget,
    ],
  );

  const track = useCallback(
    (event: BoardDragEvent) => {
      const planned = plan(event);
      if (
        trackedPlanRef.current?.planned === planned &&
        trackedPlanRef.current.comparator === comparator
      ) {
        return;
      }
      trackedPlanRef.current = { planned, comparator };
      const next = planned
        ? previewBoardMove({
            moves: planned.moves,
            displayItems: itemsByStatus.get(planned.status) ?? [],
            comparator,
          })
        : null;
      setPreview((current) =>
        sameDropPreview(current, next) ? current : next,
      );
    },
    [comparator, itemsByStatus, plan],
  );

  const start = useCallback(
    (event: Pick<DragStartEvent, "active">) => {
      const id = String(event.active.id);
      nowRef.current = Date.now();
      const bundle = dragBundle(id, selectedIds, issueMap, rankById);
      bundleRef.current = bundle;
      bundleIdsRef.current = new Set(bundle.map((issue) => issue.id));
      cardNodesRef.current = manual
        ? new Map(
            Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR))
              .map((node) => [node.dataset.issueId, node] as const)
              .filter(
                (entry): entry is readonly [string, HTMLElement] =>
                  entry[0] != null,
              ),
          )
        : new Map();
      cardGeometryRef.current.clear();
      planCacheRef.current = null;
      trackedPlanRef.current = null;
      setActiveId(id);
      setDraggingIds(new Set(bundle.map((issue) => issue.id)));
      setPreview(null);
    },
    [issueMap, manual, rankById, selectedIds],
  );

  const end = useCallback(() => {
    bundleRef.current = [];
    bundleIdsRef.current.clear();
    cardNodesRef.current.clear();
    cardGeometryRef.current.clear();
    planCacheRef.current = null;
    trackedPlanRef.current = null;
    setActiveId(null);
    setDraggingIds(new Set());
    setPreview(null);
  }, []);

  return { preview, draggingIds, activeId, start, track, plan, end };
}
