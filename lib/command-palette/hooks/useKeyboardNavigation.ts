/**
 * useKeyboardNavigation - Keyboard navigation for the command palette.
 *
 * - ↑/↓ navigate items one by one (with wrap-around)
 * - Cmd/Ctrl+↑/↓ jump between category groups
 * - Enter executes the default action
 * - Escape closes
 * - (⌘M / → open the actions popover — handled by SearchView/ResultItem)
 */

import { useCallback, useEffect, useRef } from "react";
import { usePaletteConfig } from "../config";
import { usePaletteStore } from "../store";
import type { ActionExecutionContext } from "../registry/types";
import type { PaletteItem } from "../types";

// =============================================================================
// TYPES
// =============================================================================

export interface KeyboardNavigationOptions {
  /** Current list of items (for bounds checking). */
  items: PaletteItem[];
  /** Context for action execution. */
  actionContext: ActionExecutionContext;
  /** Callback when the palette should close. */
  onClose: () => void;
  /** Callback when item is selected via Enter. */
  onSelectItem?: (item: PaletteItem) => void | Promise<void>;
  /** Whether keyboard navigation is enabled. */
  enabled?: boolean;
  /** Whether Enter key selection is allowed (for compact mode). */
  allowSelection?: boolean;
  /** Starting index of each group for Cmd+Arrow navigation. */
  groupStartIndices?: number[];
  /** Disable ArrowUp navigation (when history navigation takes over). */
  disableArrowUp?: boolean;
}

export interface KeyboardNavigationResult {
  handleKeyDown: (e: KeyboardEvent | React.KeyboardEvent) => void;
}

// =============================================================================
// HOOK
// =============================================================================

export function useKeyboardNavigation({
  items,
  actionContext,
  onClose,
  onSelectItem,
  enabled = true,
  allowSelection = true,
  groupStartIndices = [],
  disableArrowUp = false,
}: KeyboardNavigationOptions): KeyboardNavigationResult {
  const { registry } = usePaletteConfig();
  const view = usePaletteStore((s) => s.view);
  const activeIndex = usePaletteStore((s) => s.activeIndex);
  const isActionsPopoverOpen = usePaletteStore((s) => s.isActionsPopoverOpen);
  const setActiveIndex = usePaletteStore((s) => s.setActiveIndex);
  const moveActiveIndex = usePaletteStore((s) => s.moveActiveIndex);
  const closeForm = usePaletteStore((s) => s.closeForm);

  // Refs for frequently-changing values so handleKeyDown stays stable
  const itemsRef = useRef(items);
  const groupStartIndicesRef = useRef(groupStartIndices);
  const activeIndexRef = useRef(activeIndex);
  const disableArrowUpRef = useRef(disableArrowUp);
  const allowSelectionRef = useRef(allowSelection);
  const onSelectItemRef = useRef(onSelectItem);
  const actionContextRef = useRef(actionContext);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { groupStartIndicesRef.current = groupStartIndices; }, [groupStartIndices]);
  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { disableArrowUpRef.current = disableArrowUp; }, [disableArrowUp]);
  useEffect(() => { allowSelectionRef.current = allowSelection; }, [allowSelection]);
  useEffect(() => { onSelectItemRef.current = onSelectItem; }, [onSelectItem]);
  useEffect(() => { actionContextRef.current = actionContext; }, [actionContext]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent | React.KeyboardEvent) => {
      if (!enabled) return;

      // The actions popover has its own keyboard handling
      if (isActionsPopoverOpen) return;

      const key = e.key;
      const currentItems = itemsRef.current;
      const currentGroupIndices = groupStartIndicesRef.current;
      const currentActiveIndex = activeIndexRef.current;
      const maxItemIndex = currentItems.length - 1;
      const hasModifier = e.metaKey || e.ctrlKey;

      if (view === "search") {
        switch (key) {
          case "ArrowUp":
            if (disableArrowUpRef.current) break;
            e.preventDefault();
            if (hasModifier && currentGroupIndices.length > 1) {
              // Cmd/Ctrl+Up: jump to previous group's first item
              let currentGroupIndex = 0;
              for (let i = currentGroupIndices.length - 1; i >= 0; i--) {
                if (currentActiveIndex >= currentGroupIndices[i]) {
                  currentGroupIndex = i;
                  break;
                }
              }
              const prevGroupIndex =
                currentGroupIndex > 0
                  ? currentGroupIndex - 1
                  : currentGroupIndices.length - 1;
              setActiveIndex(currentGroupIndices[prevGroupIndex]);
            } else {
              moveActiveIndex(-1, maxItemIndex);
            }
            break;

          case "ArrowDown":
            e.preventDefault();
            if (hasModifier && currentGroupIndices.length > 1) {
              // Cmd/Ctrl+Down: jump to next group's first item
              let currentGroupIndex = 0;
              for (let i = currentGroupIndices.length - 1; i >= 0; i--) {
                if (currentActiveIndex >= currentGroupIndices[i]) {
                  currentGroupIndex = i;
                  break;
                }
              }
              const nextGroupIndex =
                currentGroupIndex < currentGroupIndices.length - 1
                  ? currentGroupIndex + 1
                  : 0;
              setActiveIndex(currentGroupIndices[nextGroupIndex]);
            } else {
              moveActiveIndex(1, maxItemIndex);
            }
            break;

          case "Enter": {
            e.preventDefault();
            if (!allowSelectionRef.current) break;
            const selectedItem = currentItems[currentActiveIndex];
            if (selectedItem) {
              const selectHandler = onSelectItemRef.current;
              if (selectHandler) {
                selectHandler(selectedItem);
              } else {
                registry
                  .executeDefaultAction(selectedItem, actionContextRef.current)
                  .then((result) => {
                    if (result.closeMenu) {
                      onClose();
                    }
                  });
              }
            }
            break;
          }

          case "Escape":
            e.preventDefault();
            onClose();
            break;
        }
      } else if (view === "form") {
        // Fallback when focus is lost from the inline form fields
        // (InlineActionInput handles Escape with stopPropagation when focused)
        if (key === "Escape") {
          e.preventDefault();
          closeForm();
        }
      }
    },
    [
      enabled,
      view,
      isActionsPopoverOpen,
      onClose,
      setActiveIndex,
      moveActiveIndex,
      closeForm,
      registry,
    ]
  );

  // Attach global keyboard listener
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener("keydown", handler);

    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, [enabled, handleKeyDown]);

  // Clamp active index when the list shrinks
  useEffect(() => {
    if (activeIndex > items.length - 1 && items.length > 0) {
      setActiveIndex(items.length - 1);
    }
  }, [items.length, activeIndex, setActiveIndex]);

  return { handleKeyDown };
}

export default useKeyboardNavigation;
