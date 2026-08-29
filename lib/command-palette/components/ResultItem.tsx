/**
 * ResultItem - Compact palette row.
 *
 * Features:
 * - Compact design (no descriptions)
 * - Status dot, context label and type label (all optional, data-driven)
 * - Per-entity icon tinting via data-item-type + --cp-icon-* tokens
 * - Mobile gesture support (via props)
 */

"use client";

import { useCallback, memo, type ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import styles from "../styles/ResultItem.module.css";
import type { PaletteItem } from "../types";

// =============================================================================
// TYPES
// =============================================================================

export interface ResultItemProps {
  /** The palette item to render. */
  item: PaletteItem;
  /** Whether this item is currently highlighted. */
  isActive: boolean;
  /** Called when item is selected (clicked or Enter). */
  onSelect: () => void;
  /** Called when actions should be opened (→ key or swipe). */
  onOpenActions?: () => void;
  /** Whether this item has contextual actions. */
  hasActions: boolean;
  /** Whether we're on mobile (hides shortcuts/type labels). */
  isMobile?: boolean;
  /** Touch event handlers for mobile gestures. */
  touchHandlers?: {
    onTouchStart?: (e: React.TouchEvent) => void;
    onTouchMove?: (e: React.TouchEvent) => void;
    onTouchEnd?: (e: React.TouchEvent) => void;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Entity type used for icon tinting (data-item-type attribute).
 * Favorite clones keep their original entity type.
 */
function getItemType(item: PaletteItem): string | undefined {
  if (item.entityType) return item.entityType;
  const original = (item as PaletteItem & { originalFilterCategory?: string })
    .originalFilterCategory;
  return original ?? item.filterCategory;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Wrapped with React.memo: ResultsList renders many rows and only
 * activeIndex changes during keyboard navigation.
 */
export const ResultItem = memo(function ResultItem({
  item,
  isActive,
  onSelect,
  onOpenActions,
  hasActions,
  isMobile = false,
  touchHandlers,
}: ResultItemProps) {
  const itemType = getItemType(item);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect();
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onSelect();
      } else if (e.key === "ArrowRight" && hasActions && onOpenActions) {
        e.preventDefault();
        onOpenActions();
      }
    },
    [onSelect, hasActions, onOpenActions]
  );

  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`${styles.item} ${isActive ? styles.active : ""}`}
      data-testid="result-item"
      {...touchHandlers}
    >
      {/* Icon with type-based coloring */}
      <span className={styles.icon} data-item-type={itemType}>
        {item.icon as ReactNode}
      </span>

      {/* Content */}
      <span className={styles.content}>
        {/* Status dot */}
        {item.statusDot && (
          <span
            className={`${styles.statusBadge} ${styles[item.statusDot] ?? ""}`}
            aria-hidden="true"
          />
        )}

        {/* Title */}
        <span className={styles.title}>{item.title}</span>

        {/* Context info (e.g. "Project › Module") */}
        {item.contextLabel && (
          <span className={styles.context}>{item.contextLabel}</span>
        )}
      </span>

      {/* Shortcut hint (desktop only) */}
      {item.shortcut && item.shortcut.length > 0 && !isMobile && (
        <span className={styles.shortcut}>
          {item.shortcut.map((key, i) => (
            <Kbd key={i}>
              {key}
            </Kbd>
          ))}
        </span>
      )}

      {/* Type indicator */}
      {item.typeLabel && (
        <span className={styles.typeIndicator}>{item.typeLabel}</span>
      )}
    </div>
  );
});

export default ResultItem;
