/**
 * ResultsList - Virtualized list of palette items.
 *
 * Features:
 * - Virtualization with react-window for performance on large lists
 * - Items grouped by category (flattened for virtualization)
 * - Smooth scroll-into-view of the highlighted row
 * - Loading and empty states
 */

"use client";

import { useMemo, useEffect, useCallback, type ReactElement } from "react";
import { List, useListRef, type RowComponentProps } from "react-window";
import { usePaletteConfig } from "../config";
import { ResultItem } from "./ResultItem";
import styles from "../styles/ResultsList.module.css";
import type { PaletteItem } from "../types";

// =============================================================================
// TYPES
// =============================================================================

/** Group of items with a category header. */
export interface ItemGroup {
  category: string;
  items: PaletteItem[];
}

export interface ResultsListProps {
  /** Grouped items to display. */
  groups: ItemGroup[];
  /** Currently highlighted index. */
  activeIndex: number;
  /** Called when an item is selected. */
  onSelect: (item: PaletteItem) => void;
  /** Called when actions should be opened for an item. */
  onOpenActions: (item: PaletteItem) => void;
  /** Check if an item has actions available. */
  hasActions: (item: PaletteItem) => boolean;
  /** Whether the list is loading. */
  isLoading?: boolean;
  /** Empty state component. */
  emptyState?: React.ReactNode;
  /** Height of the list container. */
  height?: number;
  /** Whether we're on mobile. */
  isMobile?: boolean;
  /** Touch handlers for mobile gestures. */
  getTouchHandlers?: (item: PaletteItem) => {
    onTouchStart?: (e: React.TouchEvent) => void;
    onTouchMove?: (e: React.TouchEvent) => void;
    onTouchEnd?: (e: React.TouchEvent) => void;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ITEM_HEIGHT = 44;
const HEADER_HEIGHT = 28;
const MIN_LIST_HEIGHT = 100;
const MAX_LIST_HEIGHT = 400;
const SCROLL_PADDING = 8; // Padding at top/bottom for spacer rows + scroll alignment

/**
 * Calculate the optimal list height based on content,
 * clamped to MAX_LIST_HEIGHT.
 */
export function calculateListHeight(groups: ItemGroup[]): number {
  let totalHeight = 0;

  for (const group of groups) {
    if (group.items.length === 0) continue;
    totalHeight += HEADER_HEIGHT;
    totalHeight += group.items.length * ITEM_HEIGHT;
  }

  if (totalHeight > 0) {
    totalHeight += SCROLL_PADDING * 2;
  }

  return Math.max(MIN_LIST_HEIGHT, Math.min(totalHeight, MAX_LIST_HEIGHT));
}

// =============================================================================
// HELPERS
// =============================================================================

/** Flattened row types. */
type FlatRow =
  | { type: "padding"; position: "top" | "bottom" }
  | { type: "header"; category: string }
  | { type: "item"; item: PaletteItem; globalIndex: number };

/**
 * Flatten groups into renderable rows with padding in a single pass.
 */
function flattenGroupsWithPadding(groups: ItemGroup[]): FlatRow[] {
  let capacity = 2; // top + bottom padding
  for (const group of groups) {
    if (group.items.length > 0) {
      capacity += 1 + group.items.length; // header + items
    }
  }

  if (capacity === 2) return []; // No groups with items

  const rows: FlatRow[] = new Array(capacity);
  let index = 0;
  let globalIndex = 0;

  rows[index++] = { type: "padding", position: "top" };

  for (const group of groups) {
    if (group.items.length === 0) continue;

    rows[index++] = { type: "header", category: group.category };

    for (const item of group.items) {
      rows[index++] = { type: "item", item, globalIndex };
      globalIndex++;
    }
  }

  rows[index++] = { type: "padding", position: "bottom" };

  return rows;
}

function getRowHeightForRow(row: FlatRow): number {
  switch (row.type) {
    case "header":
      return HEADER_HEIGHT;
    case "padding":
      return SCROLL_PADDING;
    case "item":
    default:
      return ITEM_HEIGHT;
  }
}

/**
 * Calculate row offsets for all rows in a single pass (O(1) lookups later).
 */
function calculateRowOffsets(rows: FlatRow[]): number[] {
  const offsets = new Array<number>(rows.length);
  let currentOffset = 0;

  for (let i = 0; i < rows.length; i++) {
    offsets[i] = currentOffset;
    currentOffset += getRowHeightForRow(rows[i]);
  }

  return offsets;
}

/** Get total items count (excluding headers). */
function getTotalItems(groups: ItemGroup[]): number {
  return groups.reduce((sum, g) => sum + g.items.length, 0);
}

// =============================================================================
// ROW COMPONENT
// =============================================================================

interface RowData {
  rows: FlatRow[];
  activeIndex: number;
  onSelect: (item: PaletteItem) => void;
  onOpenActions: (item: PaletteItem) => void;
  hasActions: (item: PaletteItem) => boolean;
  isMobile: boolean;
  getTouchHandlers?: ResultsListProps["getTouchHandlers"];
}

function Row({
  index,
  style,
  rows,
  activeIndex,
  onSelect,
  onOpenActions,
  hasActions,
  isMobile,
  getTouchHandlers,
}: RowComponentProps<RowData>): ReactElement {
  const row = rows[index];

  if (row.type === "padding") {
    return <div style={style} aria-hidden="true" />;
  }

  if (row.type === "header") {
    return (
      <div style={style} className={styles.header}>
        <span className={styles.headerText}>{row.category}</span>
      </div>
    );
  }

  const isActive = row.globalIndex === activeIndex;

  return (
    <div style={style} data-result-index={row.globalIndex}>
      <ResultItem
        item={row.item}
        isActive={isActive}
        onSelect={() => onSelect(row.item)}
        onOpenActions={() => onOpenActions(row.item)}
        hasActions={hasActions(row.item)}
        isMobile={isMobile}
        touchHandlers={getTouchHandlers?.(row.item)}
      />
    </div>
  );
}

// =============================================================================
// SCROLL HELPER
// =============================================================================

interface ScrollTargetInput {
  itemTop: number;
  itemBottom: number;
  scrollTop: number;
  viewportHeight: number;
  scrollPadding: number;
  scrollHeight: number;
}

export function getScrollTarget({
  itemTop,
  itemBottom,
  scrollTop,
  viewportHeight,
  scrollPadding,
  scrollHeight,
}: ScrollTargetInput): number | null {
  const visibleTop = scrollTop + scrollPadding;
  const visibleBottom = scrollTop + viewportHeight - scrollPadding;

  let targetScroll: number | null = null;

  if (itemTop < visibleTop) {
    targetScroll = itemTop - scrollPadding;
  } else if (itemBottom > visibleBottom) {
    targetScroll = itemBottom - viewportHeight + scrollPadding;
  }

  if (targetScroll === null) {
    return null;
  }

  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  const clampedScroll = Math.max(0, Math.min(targetScroll, maxScroll));

  if (clampedScroll === scrollTop) {
    return null;
  }

  return clampedScroll;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ResultsList({
  groups,
  activeIndex,
  onSelect,
  onOpenActions,
  hasActions,
  isLoading = false,
  emptyState,
  height,
  isMobile = false,
  getTouchHandlers,
}: ResultsListProps) {
  const { t } = usePaletteConfig();
  const listRef = useListRef(null);

  const rows = useMemo(() => flattenGroupsWithPadding(groups), [groups]);
  const totalItems = useMemo(() => getTotalItems(groups), [groups]);

  // Pre-calculated offsets for O(1) lookup during scroll operations
  const rowOffsets = useMemo(() => calculateRowOffsets(rows), [rows]);

  const listHeight = height ?? calculateListHeight(groups);

  const getRowHeight = useCallback(
    (index: number) => {
      const row = rows[index];
      return row ? getRowHeightForRow(row) : ITEM_HEIGHT;
    },
    [rows]
  );

  // Scroll active item into view with padding
  useEffect(() => {
    if (activeIndex < 0) return;

    const rowIndex = rows.findIndex(
      (row) => row.type === "item" && row.globalIndex === activeIndex
    );
    if (rowIndex < 0) return;

    const scrollContainer = listRef.current?.element;
    if (!scrollContainer) return;

    const itemOffset = rowOffsets[rowIndex] ?? 0;
    const itemHeight = getRowHeight(rowIndex);
    const containerHeight = scrollContainer.clientHeight;
    if (containerHeight <= 0) return;
    const currentScroll = scrollContainer.scrollTop;

    const targetScroll = getScrollTarget({
      itemTop: itemOffset,
      itemBottom: itemOffset + itemHeight,
      scrollTop: currentScroll,
      viewportHeight: containerHeight,
      scrollPadding: SCROLL_PADDING,
      scrollHeight: scrollContainer.scrollHeight,
    });

    if (targetScroll !== null) {
      scrollContainer.scrollTo({
        top: targetScroll,
        behavior: "smooth",
      });
    }
  }, [activeIndex, rows, rowOffsets, listHeight, listRef, getRowHeight]);

  // Loading state
  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingSpinner} />
        <span className={styles.loadingText}>{t("results.loading")}</span>
      </div>
    );
  }

  // Empty state
  if (totalItems === 0) {
    if (emptyState) {
      return <>{emptyState}</>;
    }

    return (
      <div className={styles.empty}>
        <span className={styles.emptyTitle}>{t("results.empty.title")}</span>
        <span className={styles.emptyHint}>{t("results.empty.hint")}</span>
      </div>
    );
  }

  return (
    <div className={styles.container} role="listbox" style={{ height: listHeight }}>
      <List
        listRef={listRef}
        rowComponent={Row}
        rowCount={rows.length}
        rowHeight={getRowHeight}
        rowProps={{
          rows,
          activeIndex,
          onSelect,
          onOpenActions,
          hasActions,
          isMobile,
          getTouchHandlers,
        }}
        className={styles.list}
        style={{ height: listHeight }}
      />
    </div>
  );
}

export default ResultsList;
