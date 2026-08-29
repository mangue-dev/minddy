/**
 * SearchBar - Search input of the palette.
 *
 * Features:
 * - Dynamic placeholder based on the active category
 * - Keyboard handling (Escape, arrows, Tab → custom view)
 * - History recall badge
 */

"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Kbd } from "@/components/ui/kbd";
import { usePaletteConfig } from "../config";
import { SearchIcon } from "../icons";
import styles from "../styles/SearchBar.module.css";

// =============================================================================
// TYPES
// =============================================================================

export interface SearchBarProps {
  /** Current search query. */
  value: string;
  /** Called when query changes. */
  onChange: (value: string) => void;
  /** Current category filter (for placeholder). */
  categoryFilter: string;
  /** Called on Escape key. */
  onEscape?: () => void;
  /** Called on Enter key. */
  onEnter?: () => void;
  /** Called on Arrow Down key. */
  onArrowDown?: () => void;
  /** Called on Arrow Up key. */
  onArrowUp?: () => void;
  /** Called on Tab key (enters the tab view with the current query). */
  onTab?: (query: string) => void;
  /** Hint label displayed next to the Tab kbd. */
  tabHint?: string;
  /** Whether the input should be auto-focused. */
  autoFocus?: boolean;
  /** Aria label for accessibility. */
  ariaLabel?: string;
  /** External ref to access the input element. */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Current history navigation index (-1 = not navigating). */
  historyIndex?: number;
  /** Called when navigating history with arrow keys. */
  onHistoryNavigate?: (direction: "up" | "down") => void;
  /** Disable ArrowUp history navigation when input is empty. */
  disableHistoryOnArrowUp?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SearchBar({
  value,
  onChange,
  categoryFilter,
  onEscape,
  onEnter,
  onArrowDown,
  onArrowUp,
  onTab,
  tabHint,
  autoFocus = true,
  ariaLabel,
  inputRef: externalInputRef,
  historyIndex = -1,
  onHistoryNavigate,
  disableHistoryOnArrowUp = false,
}: SearchBarProps) {
  const { t, categories } = usePaletteConfig();
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  // Focus input on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Small delay to ensure the menu animation has started
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // Placeholder: category-specific override, else default
  const placeholder =
    categories.find((c) => c.id === categoryFilter)?.placeholder ??
    t("search.placeholder");

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onEscape?.();
          break;
        case "Enter":
          e.preventDefault();
          onEnter?.();
          break;
        case "ArrowDown":
          e.preventDefault();
          // In history mode, continue navigating history
          if (historyIndex >= 0 && onHistoryNavigate) {
            e.stopPropagation();
            onHistoryNavigate("down");
          } else {
            onArrowDown?.();
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          // Navigate history when input is empty or already in history mode
          if (
            onHistoryNavigate &&
            (historyIndex >= 0 || (value === "" && !disableHistoryOnArrowUp))
          ) {
            e.stopPropagation();
            onHistoryNavigate("up");
          } else {
            onArrowUp?.();
          }
          break;
        case "Tab":
          if (onTab) {
            e.preventDefault();
            onTab(value);
          }
          break;
      }
    },
    [onEscape, onEnter, onArrowDown, onArrowUp, onTab, value, historyIndex, onHistoryNavigate, disableHistoryOnArrowUp]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <SearchIcon className={styles.searchIcon} />
      </div>

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={styles.input}
        aria-label={ariaLabel ?? t("search.ariaLabel")}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {historyIndex >= 0 && (
        <div className={styles.historyBadge}>{t("search.historyMode")}</div>
      )}

      {value.length > 0 && onTab && tabHint && historyIndex < 0 && (
        <div className={styles.tabHint}>
          <Kbd>Tab</Kbd>
          <span className={styles.tabLabel}>{tabHint}</span>
        </div>
      )}
    </div>
  );
}

export default SearchBar;
