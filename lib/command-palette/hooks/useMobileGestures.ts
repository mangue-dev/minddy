/**
 * useMobileGestures - Touch gesture handling for the command palette
 *
 * Provides swipe and long-press gesture detection for mobile devices:
 * - Swipe left on item → opens actions popover
 * - Swipe right in actions popover → closes it
 * - Long press → alternative to swipe (for accessibility)
 */

import { useCallback, useRef, useEffect } from "react";
import { usePaletteStore } from "../store";
import type { PaletteItem } from "../types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum distance in pixels for a swipe to be recognized */
const SWIPE_THRESHOLD = 50;

/** Maximum vertical distance for a horizontal swipe */
const SWIPE_VERTICAL_THRESHOLD = 30;

/** Duration in ms for long press */
const LONG_PRESS_DURATION = 500;

/** Velocity threshold for swipe (pixels per ms) */
const SWIPE_VELOCITY_THRESHOLD = 0.3;

// =============================================================================
// TYPES
// =============================================================================

export interface MobileGestureOptions {
  /** Callback when swipe left is detected (opens actions) */
  onSwipeLeft?: (item: PaletteItem) => void;
  /** Callback when swipe right is detected (closes actions) */
  onSwipeRight?: () => void;
  /** Callback when long press is detected */
  onLongPress?: (item: PaletteItem) => void;
  /** Whether gestures are enabled */
  enabled?: boolean;
}

export interface MobileGestureHandlers {
  /** Touch start handler */
  onTouchStart: (e: React.TouchEvent, item?: PaletteItem) => void;
  /** Touch move handler */
  onTouchMove: (e: React.TouchEvent) => void;
  /** Touch end handler */
  onTouchEnd: (e: React.TouchEvent) => void;
  /** Touch cancel handler */
  onTouchCancel: () => void;
  /** Whether a gesture is in progress */
  isGestureActive: boolean;
  /** Current swipe offset (for animations) */
  swipeOffset: number;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  item: PaletteItem | null;
  isActive: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

export function useMobileGestures(options: MobileGestureOptions = {}): MobileGestureHandlers {
  const { onSwipeLeft, onSwipeRight, onLongPress, enabled = true } = options;

  // Four selectors, not a bare `usePaletteStore()` (MIN-323): called without
  // selector, the store subscribes to ITS ENTIRE STATE — so with each keystroke in
  // the palette, each time the active index is moved. It is the rule that
  // `views/SearchView.tsx` already documents for itself.
  const view = usePaletteStore((s) => s.view);
  const isActionsPopoverOpen = usePaletteStore((s) => s.isActionsPopoverOpen);
  const openActionsForItem = usePaletteStore((s) => s.openActionsForItem);
  const closeActionsPopover = usePaletteStore((s) => s.closeActionsPopover);

  // Touch state
  const touchStateRef = useRef<TouchState>({
    startX: 0,
    startY: 0,
    startTime: 0,
    currentX: 0,
    currentY: 0,
    item: null,
    isActive: false,
  });

  // Long press timer
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Swipe offset for animation
  const swipeOffsetRef = useRef(0);

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, [clearLongPressTimer]);

  // Touch start handler
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, item?: PaletteItem) => {
      if (!enabled) return;

      const touch = e.touches[0];
      touchStateRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        currentX: touch.clientX,
        currentY: touch.clientY,
        item: item ?? null,
        isActive: true,
      };

      swipeOffsetRef.current = 0;

      // Start long press timer
      if (item && onLongPress) {
        clearLongPressTimer();
        longPressTimerRef.current = setTimeout(() => {
          if (touchStateRef.current.isActive && item) {
            onLongPress(item);
            touchStateRef.current.isActive = false;
          }
        }, LONG_PRESS_DURATION);
      }
    },
    [enabled, onLongPress, clearLongPressTimer]
  );

  // Touch move handler
  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !touchStateRef.current.isActive) return;

      const touch = e.touches[0];
      touchStateRef.current.currentX = touch.clientX;
      touchStateRef.current.currentY = touch.clientY;

      const deltaX = touch.clientX - touchStateRef.current.startX;
      const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);

      // Cancel long press if moved too much
      if (Math.abs(deltaX) > 10 || deltaY > 10) {
        clearLongPressTimer();
      }

      // Update swipe offset for animation
      swipeOffsetRef.current = deltaX;
    },
    [enabled, clearLongPressTimer]
  );

  // Touch end handler
  const handleTouchEnd = useCallback(
    (_e: React.TouchEvent) => {
      if (!enabled || !touchStateRef.current.isActive) return;

      clearLongPressTimer();

      const { startX, startY, startTime, currentX, currentY, item } = touchStateRef.current;
      const deltaX = currentX - startX;
      const deltaY = Math.abs(currentY - startY);
      const duration = Date.now() - startTime;
      const velocity = Math.abs(deltaX) / duration;

      // Check if it's a valid horizontal swipe
      const isHorizontalSwipe =
        Math.abs(deltaX) > SWIPE_THRESHOLD &&
        deltaY < SWIPE_VERTICAL_THRESHOLD &&
        velocity > SWIPE_VELOCITY_THRESHOLD;

      if (isHorizontalSwipe) {
        if (deltaX < 0) {
          // Swipe left → open actions
          if (view === "search" && !isActionsPopoverOpen && item) {
            if (onSwipeLeft) {
              onSwipeLeft(item);
            } else {
              openActionsForItem(item);
            }
          }
        } else {
          // Swipe right → close actions popover
          if (isActionsPopoverOpen) {
            if (onSwipeRight) {
              onSwipeRight();
            } else {
              closeActionsPopover();
            }
          }
        }
      }

      // Reset state
      touchStateRef.current.isActive = false;
      swipeOffsetRef.current = 0;
    },
    [enabled, view, isActionsPopoverOpen, onSwipeLeft, onSwipeRight, openActionsForItem, closeActionsPopover, clearLongPressTimer]
  );

  // Touch cancel handler
  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer();
    touchStateRef.current.isActive = false;
    swipeOffsetRef.current = 0;
  }, [clearLongPressTimer]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
    isGestureActive: touchStateRef.current.isActive,
    swipeOffset: swipeOffsetRef.current,
  };
}

// =============================================================================
// UTILITY HOOK
// =============================================================================

/**
 * Hook to detect if device supports touch
 */
export function useIsTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export default useMobileGestures;
