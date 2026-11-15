"use client";

// Drag and drop of the page tree, driven by the pointer rather than by native
// HTML drag, whose browser-drawn snapshot of the row lagged behind it. Here a
// translucent ghost of the row follows the pointer freely, letting the rows
// and drop marks beneath show through; what the gesture means still comes from the
// VERTICAL position of the pointer in the row it is over (top third / middle /
// bottom third → before / inside / after, lib/pages-move.ts), read in the
// tree's column even when the pointer strays sideways.

import { useCallback, useEffect, useRef, useState } from "react";
import { DRAG_ACTIVATION_DISTANCE } from "@/lib/drag-feel";
import { dropModeAt, type PageDropMode } from "@/lib/pages-move";

const ROW_ATTR = "data-page-row-id";
/** How close to the tree's top or bottom edge the pointer scrolls it. */
const EDGE_SCROLL_ZONE = 32;
const EDGE_SCROLL_STEP = 10;
/** The ghost's side inset, which keeps the row's chevron clear of its ends. */
const GHOST_INSET = 6;
/** How much of the dragged row's ghost shows. */
const GHOST_OPACITY = 0.6;
/** How long a dropped ghost waits, at most, for its row to reach its new
 *  place; it glides as soon as the row has moved. */
const SETTLE_WAIT = 800;
const SETTLE_DURATION = 180;
const SETTLE_EASING = "cubic-bezier(0.2, 0, 0, 1)";

type Press = {
  id: string;
  row: HTMLElement;
  startX: number;
  startY: number;
  /** Set once the pointer has moved past the activation distance. */
  ghost: HTMLElement | null;
  offsetX: number;
  offsetY: number;
};

export type PageTreeDrop = { id: string; mode: PageDropMode };

function scrollParent(node: HTMLElement): HTMLElement | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if (overflowY === "auto" || overflowY === "scroll") return el;
  }
  return null;
}

function makeGhost(row: HTMLElement): HTMLElement {
  const rect = row.getBoundingClientRect();
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.removeAttribute(ROW_ATTR);
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    // Wider than the row by its side inset, so the title stays exactly where
    // it was on the row instead of shifting sideways as the drag starts.
    left: `${rect.left - GHOST_INSET}px`,
    top: `${rect.top}px`,
    width: `${rect.width + GHOST_INSET * 2}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: "1200",
    pointerEvents: "none",
    background: "var(--popover)",
    boxShadow: "var(--shadow-md)",
    // A pill, like the other dragged tabs and pills of the app; the side
    // inset keeps the row's chevron clear of the rounded ends.
    borderRadius: "9999px",
    paddingInline: `${GHOST_INSET}px`,
    overflow: "hidden",
    // A ghost, not an opaque copy: the rows it passes over show through.
    opacity: String(GHOST_OPACITY),
  });
  document.body.appendChild(ghost);
  return ghost;
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rowById = (id: string) =>
  document.querySelector<HTMLElement>(`[${ROW_ATTR}="${CSS.escape(id)}"]`);

/** Glides the ghost onto a row's box, fading it out when `fade` is set. */
function glideGhost(ghost: HTMLElement, to: DOMRect, fade: boolean): Promise<void> {
  const from = ghost.getBoundingClientRect();
  // The ghost overhangs the row by its inset on each side.
  const dx = to.left - GHOST_INSET - from.left;
  const dy = to.top - from.top;
  return ghost
    .animate(
      [
        { transform: "translate(0, 0)", opacity: GHOST_OPACITY },
        { transform: `translate(${dx}px, ${dy}px)`, opacity: fade ? 0 : GHOST_OPACITY },
      ],
      { duration: SETTLE_DURATION, easing: SETTLE_EASING, fill: "forwards" },
    )
    .finished.then(
      () => {},
      () => {},
    );
}

/** Hides the ghost, gliding back to the row first when nothing was dropped. */
function dismissGhost(ghost: HTMLElement, origin: HTMLElement | null) {
  if (prefersReducedMotion() || !origin?.isConnected) {
    ghost.remove();
    return;
  }
  void glideGhost(ghost, origin.getBoundingClientRect(), false).finally(() => ghost.remove());
}

/**
 * After a drop, the ghost settles on the row in its NEW place instead of
 * vanishing. The move is written to the cache a moment after the release, so
 * removing the ghost at once showed the old order for a frame and then the
 * row snapping into place. The ghost stays until the row has moved, glides
 * onto it, and only then lets the row show (`done`). A row that disappears
 * (dropped inside a folded page) takes the ghost to that page, fading.
 */
function settleGhost(
  ghost: HTMLElement,
  id: string,
  origin: DOMRect,
  targetId: string,
  done: () => void,
) {
  const finish = () => {
    ghost.remove();
    done();
  };
  const started = performance.now();
  const step = () => {
    const row = rowById(id);
    const box = row?.getBoundingClientRect();
    const moved =
      !box ||
      Math.abs(box.top - origin.top) > 0.5 ||
      Math.abs(box.left - origin.left) > 0.5;
    if (!moved && performance.now() - started < SETTLE_WAIT) {
      requestAnimationFrame(step);
      return;
    }
    const landing = box ?? rowById(targetId)?.getBoundingClientRect();
    if (prefersReducedMotion() || !landing) {
      finish();
      return;
    }
    void glideGhost(ghost, landing, !box).finally(finish);
  };
  requestAnimationFrame(step);
}

export function usePageTreeDrag({
  enabled,
  onMove,
}: {
  enabled: boolean;
  /** `false` when the drop changes nothing: the ghost then glides home. */
  onMove: (dragId: string, targetId: string, mode: PageDropMode) => boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<PageTreeDrop | null>(null);
  const press = useRef<Press | null>(null);
  const dropRef = useRef<PageTreeDrop | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);
  const detach = useRef<(() => void) | null>(null);

  const setTarget = (next: PageTreeDrop | null) => {
    const prev = dropRef.current;
    if (prev?.id === next?.id && prev?.mode === next?.mode) return;
    dropRef.current = next;
    setDrop(next);
  };

  const finish = useCallback((commit: boolean) => {
    const current = press.current;
    press.current = null;
    detach.current?.();
    detach.current = null;
    if (!current?.ghost) return;
    const target = dropRef.current;
    document.documentElement.removeAttribute("data-dragging");
    document.body.style.removeProperty("user-select");
    // The click that ends the drag must not open the page under the pointer.
    const swallow = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
    dropRef.current = null;
    setDrop(null);
    if (commit && target && target.id !== current.id) {
      const origin = current.row.getBoundingClientRect();
      if (!onMoveRef.current(current.id, target.id, target.mode)) {
        dismissGhost(current.ghost, current.row);
        setDragId(null);
        return;
      }
      // The row stays dimmed under the ghost until it lands.
      const id = current.id;
      settleGhost(current.ghost, id, origin, target.id, () =>
        setDragId((dragging) => (dragging === id ? null : dragging)),
      );
      return;
    }
    dismissGhost(current.ghost, current.row);
    setDragId(null);
  }, []);

  useEffect(() => () => {
    detach.current?.();
    press.current?.ghost?.remove();
    document.documentElement.removeAttribute("data-dragging");
  }, []);

  const onPointerDown = useCallback(
    (id: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0 || event.pointerType !== "mouse") return;
      // The row's own controls (chevron, +, ⋯) keep their click.
      if ((event.target as Element).closest("button")) return;
      const row = event.currentTarget;
      press.current = { id, row, startX: event.clientX, startY: event.clientY, ghost: null, offsetX: 0, offsetY: 0 };
      const scroller = scrollParent(row);

      const move = (e: PointerEvent) => {
        const current = press.current;
        if (!current) return;
        if (!current.ghost) {
          if (Math.hypot(e.clientX - current.startX, e.clientY - current.startY) < DRAG_ACTIVATION_DISTANCE) return;
          current.ghost = makeGhost(current.row);
          const origin = current.row.getBoundingClientRect();
          current.offsetX = current.startX - origin.left;
          current.offsetY = current.startY - origin.top;
          document.documentElement.setAttribute("data-dragging", "");
          document.body.style.userSelect = "none";
          setDragId(current.id);
        }
        current.ghost.style.left = `${e.clientX - current.offsetX}px`;
        current.ghost.style.top = `${e.clientY - current.offsetY}px`;
        if (scroller) {
          const box = scroller.getBoundingClientRect();
          if (e.clientY < box.top + EDGE_SCROLL_ZONE) scroller.scrollTop -= EDGE_SCROLL_STEP;
          else if (e.clientY > box.bottom - EDGE_SCROLL_ZONE) scroller.scrollTop += EDGE_SCROLL_STEP;
        }
        const rowRect = current.row.getBoundingClientRect();
        const over = document
          .elementsFromPoint(rowRect.left + rowRect.width / 2, e.clientY)
          .map((el) => el.closest<HTMLElement>(`[${ROW_ATTR}]`))
          .find((el): el is HTMLElement => !!el);
        const overId = over?.getAttribute(ROW_ATTR);
        if (!over || !overId || overId === current.id) {
          setTarget(null);
          return;
        }
        const box = over.getBoundingClientRect();
        setTarget({ id: overId, mode: dropModeAt(e.clientY - box.top, box.height) });
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      const key = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || !press.current?.ghost) return;
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
      detach.current?.();
      detach.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
      };
    },
    [enabled, finish],
  );

  return { dragId, drop, onPointerDown, rowAttr: ROW_ATTR };
}
