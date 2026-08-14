/**
 * SearchView - Main search view of the palette.
 *
 * Displays search results with filtering and keyboard navigation.
 * Uses a virtualized list for performance.
 *
 * Search features:
 * - Fuzzy matching for typo tolerance
 * - Abbreviation matching (e.g. "ct" matches "Créer une tâche")
 * - Accent normalization ("creer" matches "Créer")
 * - Relevance scoring with context/usage/favorite boosts
 * - Query history recall (ArrowUp in the empty field)
 */

"use client";

import React, { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { usePaletteConfig } from "../config";
import { ActionsPopover } from "../components/ActionsPopover";
import { Footer } from "../components/Footer";
import { ResultsList, type ItemGroup } from "../components/ResultsList";
import { SearchBar } from "../components/SearchBar";
import {
  calculateSearchScore,
  loadUsageStats,
  loadFavorites,
  type SearchContext,
  type UsageStats,
} from "../search/engine";
import { useKeyboardNavigation } from "../hooks/useKeyboardNavigation";
import { useMobileGestures, useIsTouchDevice } from "../hooks/useMobileGestures";
import { eventKey } from "../hooks/usePalette";
import { usePaletteStore } from "../store";
import styles from "../styles/SearchView.module.css";
import type { ActionExecutionContext } from "../registry/types";
import type { PaletteItem, FavoritePaletteItem } from "../types";

// =============================================================================
// HOOKS
// =============================================================================

/** Debounced value with configurable delay. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// =============================================================================
// TYPES
// =============================================================================

export interface SearchViewProps {
  /** All available items (unfiltered). */
  items: PaletteItem[];
  /** Context for action execution. */
  actionContext: ActionExecutionContext;
  /** Callback when the palette should close. */
  onClose: () => void;
  /** Callback when item is selected (overrides default action execution). */
  onSelectItem?: (item: PaletteItem) => void;
  /** Callback when the user presses Tab (enters the tab view with the query). */
  onEnterTabView?: (query: string) => void;
  /** Hint label next to the Tab kbd. */
  tabHint?: string;
  /** Compact mode: show only the search bar until the user types. */
  compactMode?: boolean;
  /** Favorite item ids (overrides localStorage persistence). */
  favorites?: string[];
  /** Current history navigation index (-1 = not navigating). */
  historyIndex?: number;
  /** Navigate history (up/down), returns the query string or null. */
  onHistoryNavigate?: (direction: "up" | "down") => string | null;
  /** Reset history navigation when user types or submits. */
  onHistoryReset?: () => void;
  /** Record a query when the user selects an item. */
  onQuerySubmit?: (query: string) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SearchView({
  items,
  actionContext,
  onClose,
  onSelectItem,
  onEnterTabView,
  tabHint,
  compactMode = false,
  favorites: favoritesProp,
  historyIndex = -1,
  onHistoryNavigate,
  onHistoryReset,
  onQuerySubmit,
}: SearchViewProps) {
  const { t, registry, categories, categoryOrder, shortcuts } =
    usePaletteConfig();

  // Zustand selectors (prevent re-renders on unrelated state changes)
  const query = usePaletteStore((state) => state.query);
  const categoryFilter = usePaletteStore((state) => state.categoryFilter);
  const activeIndex = usePaletteStore((state) => state.activeIndex);
  const isActionsPopoverOpen = usePaletteStore((state) => state.isActionsPopoverOpen);
  const actionTargetItem = usePaletteStore((state) => state.actionTargetItem);
  const setQuery = usePaletteStore((state) => state.setQuery);
  const openActionsForItem = usePaletteStore((state) => state.openActionsForItem);
  const openFormForAction = usePaletteStore((state) => state.openFormForAction);
  const closeActionsPopover = usePaletteStore((state) => state.closeActionsPopover);
  const selectItem = usePaletteStore((state) => state.selectItem);

  // Debounce query for expensive scoring (50ms)
  const debouncedQuery = useDebouncedValue(query, 50);

  const isTouchDevice = useIsTouchDevice();

  // Manual expansion in compact mode (ArrowDown)
  const [isManuallyExpanded, setIsManuallyExpanded] = useState(false);
  const [hasNavigatedResults, setHasNavigatedResults] = useState(false);

  // Refs: search input (focus restore) + container (popover anchor)
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover and restore focus to the search input
  const handleCloseActionsPopover = useCallback(() => {
    closeActionsPopover();
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  }, [closeActionsPopover]);

  // Usage stats for relevance boosting
  const [usageStats, setUsageStats] = useState<Map<string, UsageStats>>(() => new Map());

  useEffect(() => {
    setUsageStats(loadUsageStats());
  }, []);

  // Favorites: prop wins, else localStorage
  const [favoritesVersion, setFavoritesVersion] = useState(0);
  const favorites = useMemo(() => {
    if (favoritesProp) {
      return new Set(favoritesProp);
    }
    return loadFavorites();
    // favoritesVersion forces a reload after toggleFavorite
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesProp, favoritesVersion]);

  // Wrap the context so the built-in favorite action refreshes the list
  const viewActionContext = useMemo(
    () => ({
      ...actionContext,
      onFavoriteChange: () => {
        actionContext.onFavoriteChange?.();
        setFavoritesVersion((v) => v + 1);
      },
    }),
    [actionContext]
  );

  // Search context for relevance boosting
  const currentContextId = viewActionContext.meta.contextId as string | undefined;
  const currentSubContextId = viewActionContext.meta.subContextId as string | undefined;
  const searchContext = useMemo<SearchContext>(
    () => ({ currentContextId, currentSubContextId }),
    [currentContextId, currentSubContextId]
  );

  // Category label matching: searching "proj" boosts items of a category named "Projects"
  const findMatchingCategories = useCallback(
    (searchQuery: string): Map<string, number> => {
      const matches = new Map<string, number>();
      if (!searchQuery.trim()) return matches;

      const normalize = (text: string) =>
        text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const normalizedQuery = normalize(searchQuery.trim());
      if (normalizedQuery.length < 2) return matches;

      for (const cat of categories) {
        if (cat.id === "all") continue;
        const normalizedLabel = normalize(cat.label);

        if (normalizedLabel === normalizedQuery) {
          matches.set(cat.id, 500);
        } else if (normalizedLabel.startsWith(normalizedQuery)) {
          matches.set(cat.id, 400);
        } else if (normalizedLabel.includes(normalizedQuery)) {
          matches.set(cat.id, 200);
        }
      }

      return matches;
    },
    [categories]
  );

  // Filter and score items
  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by category first
    if (categoryFilter !== "all") {
      result = result.filter((item) => item.filterCategory === categoryFilter);
    }

    // No query: return as-is (no scoring needed)
    if (!debouncedQuery.trim()) {
      return result;
    }

    const matchingCategories = findMatchingCategories(debouncedQuery);

    // Base score modifier per category (keeps e.g. commands above raw data)
    const boostByCategory = new Map(
      categories.map((c) => [c.id, c.searchBoost ?? 0])
    );

    const scoredItems: { item: PaletteItem; score: number }[] = [];

    for (const item of result) {
      const searchableItem = {
        id: item.id,
        title: typeof item.title === "string" ? item.title : "",
        description: item.description ?? "",
        keywords: item.keywords ?? [],
        contextId: item.contextId,
        subContextId: item.subContextId,
      };

      const scoreResult = calculateSearchScore(
        debouncedQuery,
        searchableItem,
        searchContext,
        usageStats,
        favorites
      );

      const categoryBoost = matchingCategories.get(item.filterCategory) ?? 0;
      const baseModifier = boostByCategory.get(item.filterCategory) ?? 0;

      if (scoreResult) {
        scoredItems.push({ item, score: scoreResult.score + baseModifier + categoryBoost });
      } else if (categoryBoost > 0) {
        // No content match, but the category name matches the query
        scoredItems.push({ item, score: categoryBoost + baseModifier });
      }
    }

    scoredItems.sort((a, b) => b.score - a.score);

    return scoredItems.map((s) => s.item);
  }, [items, debouncedQuery, categoryFilter, searchContext, usageStats, favorites, categories, findMatchingCategories]);

  // Compose final list: favorites group + category sort.
  // IMPORTANT: items are sorted so activeIndex matches the visual position.
  const orderedItems = useMemo(() => {
    let list = filteredItems;

    // Favorites group when not searching
    if (!query.trim() && favorites.size > 0) {
      const favoriteItems: PaletteItem[] = [];
      const nonFavoriteItems: PaletteItem[] = [];

      for (const item of list) {
        if (favorites.has(item.id)) {
          // Clone into the favorites group, keeping the original identity
          // so the registry finds the right provider
          favoriteItems.push({
            ...item,
            filterCategory: "favorites",
            originalFilterCategory: item.filterCategory,
            id: `fav:${item.id}`,
            originalId: item.id,
          } as FavoritePaletteItem);
        } else {
          nonFavoriteItems.push(item);
        }
      }

      list = [...favoriteItems, ...nonFavoriteItems];
    }

    // Sort by category order so visual order matches array order
    // (critical for keyboard navigation: activeIndex === globalIndex)
    return [...list].sort((a, b) => {
      const orderA = categoryOrder[a.filterCategory] ?? 999;
      const orderB = categoryOrder[b.filterCategory] ?? 999;
      return orderA - orderB;
    });
  }, [filteredItems, query, favorites, categoryOrder]);

  // Group items for the virtualized list
  const groups = useMemo<ItemGroup[]>(() => {
    const map = new Map<string, PaletteItem[]>();

    for (const item of orderedItems) {
      const cat = item.filterCategory;
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    }

    const labelFor = (catId: string): string => {
      if (catId === "favorites") return t("categories.favorites");
      return categories.find((c) => c.id === catId)?.label ?? t("categories.other");
    };

    // Map insertion order matches sort order
    return Array.from(map.entries()).map(([catId, groupItems]) => ({
      category: labelFor(catId),
      items: groupItems,
    }));
  }, [orderedItems, categories, t]);

  // Starting indices of each group for Cmd+Arrow navigation
  const groupStartIndices = useMemo(() => {
    const indices: number[] = [];
    let currentIndex = 0;
    for (const group of groups) {
      indices.push(currentIndex);
      currentIndex += group.items.length;
    }
    return indices;
  }, [groups]);

  // Compact mode: only show results when there's a query or manual expand
  const isExpanded = !compactMode || query.trim().length > 0 || isManuallyExpanded;

  // Item select (shared by click and keyboard)
  const handleSelect = useCallback(
    async (item: PaletteItem) => {
      const trimmedQuery = query.trim();
      if (trimmedQuery && onQuerySubmit) {
        onQuerySubmit(trimmedQuery);
      }
      if (onSelectItem) {
        onSelectItem(item);
      } else {
        // A default action without execute but with a form opens the inline
        // form directly (e.g. a "change setting" item selected with Enter)
        const defaultAction = registry.getDefaultAction(item, viewActionContext);
        if (defaultAction && !defaultAction.execute && defaultAction.requiresForm) {
          openFormForAction(defaultAction, item);
          return;
        }
        const result = await registry.executeDefaultAction(item, viewActionContext);
        if (result.closeMenu) {
          onClose();
        }
      }
    },
    [registry, viewActionContext, onClose, onQuerySubmit, onSelectItem, query, openFormForAction]
  );

  // Keyboard navigation.
  // ArrowUp disabled while history navigation owns it:
  // - history mode active (historyIndex >= 0)
  // - empty query at the first item (ArrowUp should recall history, not wrap)
  useKeyboardNavigation({
    items: orderedItems,
    actionContext: viewActionContext,
    onClose,
    onSelectItem: handleSelect,
    enabled: true,
    allowSelection: isExpanded,
    groupStartIndices,
    disableArrowUp:
      historyIndex >= 0 || (query === "" && activeIndex === 0 && !hasNavigatedResults),
  });

  // Mobile gestures
  const gestures = useMobileGestures({
    onSwipeLeft: (item) => openActionsForItem(item),
    enabled: isTouchDevice,
  });

  // Check if item has actions
  const hasActions = useCallback(
    (item: PaletteItem) => registry.hasActionsForItem(item, viewActionContext),
    [registry, viewActionContext]
  );

  // Default action label for the highlighted item (footer hint)
  const defaultActionLabel = useMemo(() => {
    const activeItem = orderedItems[activeIndex];
    if (!activeItem) return undefined;
    const defaultAction = registry.getDefaultAction(activeItem, viewActionContext);
    return defaultAction?.label;
  }, [registry, orderedItems, activeIndex, viewActionContext]);

  const handleOpenActions = useCallback(
    (item: PaletteItem) => {
      openActionsForItem(item);
    },
    [openActionsForItem]
  );

  // ⌘/Ctrl + actionsKey opens the actions popover on the highlighted item
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (eventKey(e) !== shortcuts.actionsKey) return;
      if (isActionsPopoverOpen) return;

      const item = orderedItems[activeIndex];
      if (item && hasActions(item)) {
        e.preventDefault();
        selectItem(item);
        openActionsForItem(item);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts.actionsKey, isActionsPopoverOpen, orderedItems, activeIndex, hasActions, selectItem, openActionsForItem]);

  // Touch handlers for an item
  const getTouchHandlers = useCallback(
    (item: PaletteItem) => {
      if (!isTouchDevice) return {};
      return {
        onTouchStart: (e: React.TouchEvent) => gestures.onTouchStart(e, item),
        onTouchMove: gestures.onTouchMove,
        onTouchEnd: gestures.onTouchEnd,
      };
    },
    [isTouchDevice, gestures]
  );

  // ArrowDown expands in compact mode
  const handleArrowDown = useCallback(() => {
    if (compactMode && !isExpanded) {
      setIsManuallyExpanded(true);
    }
    setHasNavigatedResults(true);
  }, [compactMode, isExpanded]);

  // History navigation updates the query
  const handleHistoryNavigate = useCallback(
    (direction: "up" | "down") => {
      if (!onHistoryNavigate) return;
      const historyQuery = onHistoryNavigate(direction);
      if (historyQuery !== null) {
        setQuery(historyQuery);
      }
    },
    [onHistoryNavigate, setQuery]
  );

  // Query change resets history navigation
  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setQuery(newQuery);
      onHistoryReset?.();
      setHasNavigatedResults(false);
    },
    [setQuery, onHistoryReset]
  );

  return (
    <div ref={containerRef} className={styles.searchView}>
      {/* Search bar */}
      <SearchBar
        value={query}
        onChange={handleQueryChange}
        categoryFilter={categoryFilter}
        onEscape={onClose}
        onTab={onEnterTabView}
        tabHint={tabHint}
        onArrowDown={handleArrowDown}
        autoFocus
        inputRef={searchInputRef}
        historyIndex={historyIndex}
        onHistoryNavigate={handleHistoryNavigate}
        disableHistoryOnArrowUp={hasNavigatedResults}
      />

      {/* Results - hidden in compact mode when no query */}
      {isExpanded && (
        <div className={styles.resultsContainer}>
          <ResultsList
            groups={groups}
            activeIndex={activeIndex}
            onSelect={handleSelect}
            onOpenActions={handleOpenActions}
            hasActions={hasActions}
            isMobile={isTouchDevice}
            getTouchHandlers={isTouchDevice ? getTouchHandlers : undefined}
          />
        </div>
      )}

      {/* Footer - always visible */}
      <Footer
        view="search"
        isMobile={isTouchDevice}
        hasActions={
          orderedItems[activeIndex] ? hasActions(orderedItems[activeIndex]) : false
        }
        compactMode={compactMode}
        isExpanded={isExpanded}
        defaultActionLabel={defaultActionLabel}
      />

      {/* Actions popover - only when expanded */}
      {isExpanded && (
        <ActionsPopover
          item={actionTargetItem}
          isOpen={isActionsPopoverOpen}
          onClose={handleCloseActionsPopover}
          actionContext={viewActionContext}
          onActionExecuted={onClose}
          anchorRef={containerRef}
        />
      )}
    </div>
  );
}

export default SearchView;
