/**
 * ActionsPopover - Inline popover for contextual actions.
 *
 * Displays the available actions for the selected item in a floating popover
 * (triggered by → or ⌘M).
 *
 * Features:
 * - Own search bar to filter actions
 * - Keyboard navigation (↑↓, Enter, Escape, Backspace to close)
 * - Click outside to close
 * - Portal on desktop for overflow, inline on mobile
 */

"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePaletteConfig } from "../config";
import { CloseIcon, SearchIcon } from "../icons";
import { usePaletteStore } from "../store";
import styles from "../styles/ActionsPopover.module.css";
import type { ActionExecutionContext, ContextualAction } from "../registry/types";
import type { PaletteItem } from "../types";

// =============================================================================
// TYPES
// =============================================================================

export interface ActionsPopoverProps {
  /** Item to show actions for (optional if actions are provided directly). */
  item?: PaletteItem | null;
  /** Whether the popover is open. */
  isOpen: boolean;
  /** Callback when popover should close. */
  onClose: () => void;
  /** Context for action execution. */
  actionContext: ActionExecutionContext;
  /** Callback when action is executed and the palette should close. */
  onActionExecuted?: () => void;
  /** Ref to the anchor element (palette container) for positioning. */
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Direct actions to display (bypasses the registry). */
  actions?: ContextualAction[];
}

interface ActionGroup {
  category: string;
  actions: ContextualAction[];
}

// =============================================================================
// HELPERS
// =============================================================================

const CATEGORY_ORDER = ["primary", "secondary", "navigation", "danger"];

function groupActionsByCategory(actions: ContextualAction[]): ActionGroup[] {
  const groups: Map<string, ContextualAction[]> = new Map();

  for (const action of actions) {
    const category = action.category ?? "secondary";
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(action);
  }

  return CATEGORY_ORDER.filter((cat) => groups.has(cat)).map((category) => ({
    category,
    actions: groups.get(category)!,
  }));
}

/** Normalize text for search (lowercase, remove accents). */
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// =============================================================================
// COMPONENT
// =============================================================================

// Popover dimensions and offsets
const POPOVER_WIDTH = 320;
const FOOTER_HEIGHT = 48;
const RIGHT_OFFSET = 12;

export function ActionsPopover({
  item,
  isOpen,
  onClose,
  actionContext,
  onActionExecuted,
  anchorRef,
  actions: directActions,
}: ActionsPopoverProps) {
  const { t, registry } = usePaletteConfig();

  const actionActiveIndex = usePaletteStore((state) => state.actionActiveIndex);
  const actionsPopoverQuery = usePaletteStore((state) => state.actionsPopoverQuery);
  const moveActionActiveIndex = usePaletteStore((state) => state.moveActionActiveIndex);
  const setActionsPopoverQuery = usePaletteStore((state) => state.setActionsPopoverQuery);
  const openFormForAction = usePaletteStore((state) => state.openFormForAction);

  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate position based on anchor element
  useLayoutEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      // Position at bottom-right of anchor, above the footer
      const top = rect.bottom - FOOTER_HEIGHT;
      const left = rect.right - POPOVER_WIDTH - RIGHT_OFFSET;

      // Bail-out d'identité : sans lui, chaque mesure repose un objet neuf,
      // donc un rendu, même quand rien n'a bougé.
      setPosition((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left }
      );
    };

    updatePosition();
    // ⚠ **Pas d'écouteur de `scroll` en capture** (MIN-318). L'ancre est
    // `styles.searchView`, dans la modale FIXE de la palette : elle ne bouge pas
    // au défilement de la page. Le seul défilement qui atteignait cet écouteur
    // était celui, animé, du `scrollIntoView({ behavior: "smooth" })` d'un peu
    // plus bas — qui émet ~60 événements par seconde, tous captés. Chaque flèche
    // pressée dans le menu ouvrait donc une boucle lecture-de-géométrie /
    // écriture-d'état pendant ~300 ms. Le geste juste est de le SUPPRIMER, pas
    // de le throttler.
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [isOpen, anchorRef]);

  // Focus input when popover opens
  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setIsMounted(false);
    }
  }, [isOpen]);

  // Get all actions for the item (or use direct actions if provided)
  const allActions = useMemo(() => {
    if (directActions) return directActions;
    if (!item) return [];
    return registry.getActionsForItem(item, actionContext);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid recompute on context identity churn
  }, [directActions, item, registry]);

  // Filter actions based on search query
  const filteredActions = useMemo(() => {
    if (!actionsPopoverQuery.trim()) {
      return allActions;
    }

    const normalizedQuery = normalizeForSearch(actionsPopoverQuery);
    return allActions.filter((action) => {
      const normalizedLabel = normalizeForSearch(action.label);
      return normalizedLabel.includes(normalizedQuery);
    });
  }, [allActions, actionsPopoverQuery]);

  // Group filtered actions by category
  const actionGroups = useMemo(
    () => groupActionsByCategory(filteredActions),
    [filteredActions]
  );

  // Flatten action groups to match visual order (for keyboard navigation)
  const flattenedActions = useMemo(() => {
    return actionGroups.flatMap((group) => group.actions);
  }, [actionGroups]);

  // Scroll active item into view
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [actionActiveIndex]);

  // Execute action
  const executeAction = useCallback(
    async (action: ContextualAction) => {
      // Form actions open the inline form (requires item)
      if (action.requiresForm) {
        if (!item) return;
        openFormForAction(action, item);
        onClose();
        return;
      }

      if (action.execute) {
        try {
          const result = await action.execute(item as PaletteItem, actionContext);

          if (result.closeMenu) {
            onActionExecuted?.();
          } else {
            onClose();
          }
        } catch (error) {
          console.error("[command-palette] action execution failed", error);
        }
      }
    },
    [item, actionContext, openFormForAction, onClose, onActionExecuted]
  );

  const handleActionClick = (action: ContextualAction) => {
    executeAction(action);
  };

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    // Ce qu'il faut ignorer, c'est l'événement qui vient d'OUVRIR le popover :
    // il est encore en cours de propagation quand cet effet s'exécute, et un
    // écouteur posé sur `document` pendant sa remontée le reçoit. On le
    // reconnaît à son horodatage — `e.timeStamp` et `performance.now()`
    // partagent la même origine —, plutôt qu'en attendant 100 ms en espérant
    // qu'il soit passé. Un chrono en dur ne dit pas ce qu'il attend, et il a
    // tort dans les deux sens : trop long si le geste suivant arrive vite, trop
    // court si le fil principal est occupé.
    const openedAt = performance.now();

    const handleClickOutside = (e: MouseEvent) => {
      if (e.timeStamp <= openedAt) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const maxIndex = flattenedActions.length - 1;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          moveActionActiveIndex(-1, maxIndex);
          break;

        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          moveActionActiveIndex(1, maxIndex);
          break;

        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          if (flattenedActions[actionActiveIndex]) {
            executeAction(flattenedActions[actionActiveIndex]);
          }
          break;

        case "Escape":
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;

        case "Backspace":
          // Close popover when pressing backspace with empty query
          if (actionsPopoverQuery === "") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
          break;
      }
    };

    // Bubbling phase so the search input receives its events first
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, flattenedActions, actionActiveIndex, moveActionActiveIndex, executeAction, onClose, actionsPopoverQuery]);

  // Need either item or directActions to show the popover
  if (!isOpen || (!item && !directActions) || !isMounted) return null;

  // Calculate global index for active state
  let globalIndex = 0;

  // Portal on desktop (with anchor), inline on mobile
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const shouldUsePortal = !isMobile && !!anchorRef?.current;

  // Wait for position before rendering with portal (prevents jump)
  if (shouldUsePortal && !position) return null;

  const usePortal = shouldUsePortal && position;

  const popoverContent = (
    <div
      className={styles.popoverWrapper}
      style={usePortal ? { position: "fixed", top: position.top, left: position.left } : undefined}
    >
      <div className={styles.popover} ref={popoverRef} role="dialog" aria-modal="true">
        {/* Search bar */}
        <div className={styles.searchContainer}>
          <SearchIcon className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder={t("actionsPopover.searchPlaceholder")}
            value={actionsPopoverQuery}
            onChange={(e) => setActionsPopoverQuery(e.target.value)}
            aria-label={t("actionsPopover.searchLabel")}
          />
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label={t("actionsPopover.close")}
          >
            <CloseIcon className={styles.closeIcon} />
          </button>
        </div>

        {/* Actions list */}
        <div className={styles.actionsList} role="menu">
          {actionGroups.map((group) => (
            <div key={group.category} className={styles.actionGroup}>
              {group.actions.map((action) => {
                const currentIndex = globalIndex++;
                const isActive = currentIndex === actionActiveIndex;

                return (
                  <button
                    key={action.id}
                    ref={isActive ? activeItemRef : null}
                    className={`${styles.actionItem} ${isActive ? styles.active : ""} ${
                      action.category === "danger" ? styles.danger : ""
                    }`}
                    onClick={() => handleActionClick(action)}
                    role="menuitem"
                    aria-current={isActive ? "true" : undefined}
                  >
                    {action.icon && <action.icon className={styles.actionIcon} />}
                    <span className={styles.actionLabel}>{action.label}</span>
                    {action.shortcut && (
                      <div className={styles.shortcut}>
                        {action.shortcut.map((key, i) => (
                          <kbd key={i} className={styles.kbd}>
                            {key}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Empty state */}
        {filteredActions.length === 0 && (
          <div className={styles.emptyState}>
            {actionsPopoverQuery.trim()
              ? t("actionsPopover.noResults")
              : t("actionsPopover.noActions")}
          </div>
        )}
      </div>
    </div>
  );

  if (usePortal) {
    return createPortal(popoverContent, document.body);
  }

  return popoverContent;
}

export default ActionsPopover;
