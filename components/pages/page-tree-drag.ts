"use client";

// Drag and drop of the page tree, driven by the pointer rather than by native
// HTML drag, whose browser-drawn snapshot of the row was faint and lagged.
// Here the row's copy follows the pointer at full strength, freely, so it is
// plain where the page will land; what the gesture means still comes from the
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
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    zIndex: "1200",
    pointerEvents: "none",
    background: "var(--popover)",
    boxShadow: "var(--shadow-md)",
    // A pill, like the other dragged tabs and pills of the app; the side
    // inset keeps the row's chevron clear of the rounded ends.
    borderRadius: "9999px",
    paddingInline: "6px",
    overflow: "hidden",
    opacity: "1",
  });
  document.body.appendChild(ghost);
  return ghost;
}

/** Hides the ghost, gliding back to the row first when nothing was dropped. */
function dismissGhost(ghost: HTMLElement, origin: HTMLElement | null) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || !origin?.isConnected) {
    ghost.remove();
    return;
  }
  const from = ghost.getBoundingClientRect();
  const to = origin.getBoundingClientRect();
  ghost
    .animate(
      [{ transform: "translate(0, 0)" }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px)` }],
      { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" },
    )
    .finished.catch(() => {})
    .finally(() => ghost.remove());
}

export function usePageTreeDrag({
  enabled,
  onMove,
}: {
  enabled: boolean;
  onMove: (dragId: string, targetId: string, mode: PageDropMode) => void;
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
    if (commit && target && target.id !== current.id) {
      onMoveRef.current(current.id, target.id, target.mode);
      current.ghost.remove();
    } else {
      dismissGhost(current.ghost, current.row);
    }
    dropRef.current = null;
    setDrop(null);
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
