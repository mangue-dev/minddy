"use client";

import {
  useCallback, useLayoutEffect, useMemo, useRef, useState,
  type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject,
} from "react";
import { useDndContext } from "@dnd-kit/core";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { DropPreview } from "@/lib/board-drag";
import {
  BOARD_ROW_ESTIMATE, BOARD_ROW_GAP, BOARD_WINDOW_OVERSCAN,
  BOARD_WINDOW_THRESHOLD, boardWindowRange, registerBoardRowHeights,
} from "@/lib/board-windowing";
import {
  BoardDropIndicator, BoardDropLandingPlaceholder, type BoardLandingPreview,
} from "./board-drop-indicator";

type Row<T> = { key: string; issue?: T; height?: number; outOfFlow?: boolean };
const LANDING_KEY = "$board-landing";
const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex="0"]';

function sameIds(a: Set<string>, b: Set<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** Measured rows retain interaction owners while the full source stays in the board. */
export function BoardWindowedItems<T extends { id: string }>({
  issues, status, scrollerRef, dropPreview, landingPreview, renderIssue,
}: {
  issues: readonly T[];
  status: string;
  scrollerRef: RefObject<HTMLDivElement | null>;
  dropPreview?: DropPreview;
  /** Only the destination column receives the placeholder; all columns hide sources. */
  landingPreview?: BoardLandingPreview;
  renderIssue: (issue: T, onInteractionChange: (id: string, open: boolean) => void) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measured = useRef(new Map<string, number>());
  const [owned, setOwned] = useState(new Set<string>());
  const [popovers, setPopovers] = useState(new Set<string>());
  const [focused, setFocused] = useState<string | null>(null);
  const { active } = useDndContext();
  const landingHere = !!landingPreview && landingPreview.status === status;
  const rows = useMemo(() => {
    const result: Row<T>[] = [];
    for (const issue of issues) {
      if (landingHere && landingPreview?.beforeIssueId === issue.id) {
        result.push({ key: LANDING_KEY, height: landingPreview.height });
      }
      result.push({ key: issue.id, issue, outOfFlow: landingPreview?.activeIds.has(issue.id) });
    }
    if (landingHere && landingPreview?.beforeIssueId === null) {
      result.push({ key: LANDING_KEY, height: landingPreview.height });
    }
    return result;
  }, [issues, landingHere, landingPreview]);
  const keys = useMemo(() => rows.map((row) => row.key), [rows]);
  const pinned = useMemo(() => new Set([
    ...owned, ...popovers, ...(focused ? [focused] : []),
    ...(active ? [String(active.id)] : []),
    ...(dropPreview?.beforeIssueId ? [dropPreview.beforeIssueId] : []),
    ...(landingPreview ? [...landingPreview.activeIds, LANDING_KEY] : []),
  ]), [owned, popovers, focused, active, dropPreview, landingPreview]);
  const windowed = issues.length > BOARD_WINDOW_THRESHOLD;
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    enabled: windowed,
    getItemKey: (index) => rows[index].key,
    estimateSize: (index) => rows[index].outOfFlow ? 0 :
      (rows[index].height ?? measured.current.get(rows[index].key) ?? BOARD_ROW_ESTIMATE) +
      (index === rows.length - 1 ? 0 : BOARD_ROW_GAP),
    overscan: BOARD_WINDOW_OVERSCAN,
    initialRect: { width: 320, height: 600 },
    scrollMargin: BOARD_ROW_GAP,
    scrollPaddingStart: BOARD_ROW_GAP,
    rangeExtractor: (range) => boardWindowRange(defaultRangeExtractor(range), keys, pinned),
    measureElement: (node) => {
      const height = node.getBoundingClientRect().height;
      const index = Number(node.dataset.index);
      const row = rows[index];
      if (row && !row.outOfFlow && row.issue) {
        measured.current.set(row.key, Math.max(0, height - (index === rows.length - 1 ? 0 : BOARD_ROW_GAP)));
      }
      return height;
    },
  });
  const onInteractionChange = useCallback((id: string, open: boolean) => {
    setOwned((previous) => {
      if (previous.has(id) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    const valid = new Set(issues.map((issue) => issue.id));
    setOwned((previous) => {
      const next = new Set([...previous].filter((id) => valid.has(id)));
      return sameIds(previous, next) ? previous : next;
    });
    for (const id of measured.current.keys()) if (!valid.has(id)) measured.current.delete(id);
    const column = scrollerRef.current;
    if (!column || !windowed) return;
    return registerBoardRowHeights(column, (id) => valid.has(id)
      ? measured.current.get(id) ?? BOARD_ROW_ESTIMATE : null);
  }, [issues, scrollerRef, windowed]);

  useLayoutEffect(() => {
    if (!windowed) return;
    // Source rows reserve no second volume while the destination owns landing.
    rows.forEach((row, index) => {
      if (row.outOfFlow) virtualizer.resizeItem(index, 0);
    });
  }, [rows, windowed, virtualizer]);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const scan = () => {
      const next = new Set<string>();
      for (const trigger of node.querySelectorAll('[aria-expanded="true"]')) {
        const id = trigger.closest<HTMLElement>('[data-board-row-id]')?.dataset.boardRowId;
        if (id) next.add(id);
      }
      setPopovers((previous) => sameIds(previous, next) ? previous : next);
    };
    const observer = new MutationObserver(scan);
    observer.observe(node, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    scan();
    return () => observer.disconnect();
  }, []);

  const focus = (event: FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    setFocused(target.closest<HTMLElement>('[data-board-row-id]')?.dataset.boardRowId ?? null);
  };
  const blur = (event: FocusEvent<HTMLDivElement>) => {
    if (!root.current?.contains(event.relatedTarget as Node | null)) setFocused(null);
  };
  const tabAcrossWindow = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!windowed || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    const wrapper = target.closest<HTMLElement>('[data-board-row-id]');
    if (!wrapper) return;
    const controls = [...wrapper.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((node) => node.getClientRects().length);
    if (target !== (event.shiftKey ? controls[0] : controls.at(-1))) return;
    const index = rows.findIndex((row) => row.key === wrapper.dataset.boardRowId);
    const nextIndex = index + (event.shiftKey ? -1 : 1);
    const next = rows[nextIndex];
    if (!next?.issue || root.current?.querySelector(`[data-board-row-id="${next.key}"]`)) return;
    event.preventDefault();
    setFocused(next.key);
    virtualizer.scrollToIndex(nextIndex, { align: "auto" });
    requestAnimationFrame(() => {
      const node = root.current?.querySelector(`[data-board-row-id="${next.key}"]`);
      const controls = node?.querySelectorAll<HTMLElement>(FOCUSABLE);
      (event.shiftKey ? controls?.[controls.length - 1] : controls?.[0])?.focus();
    });
  };
  const items = windowed ? virtualizer.getVirtualItems() : rows.map((row, index) => ({ index, key: row.key, start: 0 }));
  if (!rows.length && !dropPreview) return null;
  return <div ref={root} data-board-windowed={windowed ? "" : undefined}
    className="relative shrink-0" style={{ height: windowed ? virtualizer.getTotalSize() : undefined }}
    onFocusCapture={focus} onBlurCapture={blur} onKeyDownCapture={tabAcrossWindow}>
    {items.map((item) => {
      const row = rows[item.index];
      return <div key={row.key} data-index={item.index} data-board-row-id={row.issue ? row.key : undefined}
        ref={windowed && !row.outOfFlow ? virtualizer.measureElement : undefined}
        className="relative flex flex-col gap-2"
        style={{
          ...(windowed ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start - BOARD_ROW_GAP}px)` } : {}),
          ...(row.outOfFlow ? { position: "absolute", height: 0, padding: 0 } : { paddingBottom: item.index === rows.length - 1 ? 0 : BOARD_ROW_GAP }),
        }}>
        {dropPreview?.beforeIssueId === row.key && <BoardDropIndicator count={dropPreview.count} className="absolute inset-x-0 -top-1 !my-0" />}
        {row.issue ? renderIssue(row.issue, onInteractionChange) : <BoardDropLandingPlaceholder height={row.height ?? 0} />}
      </div>;
    })}
    {dropPreview?.beforeIssueId === null && <BoardDropIndicator count={dropPreview.count} className="absolute inset-x-0 -bottom-1 !my-0" />}
  </div>;
}
