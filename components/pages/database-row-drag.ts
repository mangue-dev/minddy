"use client";

// Moving database entries by their row handle, driven by the pointer — the
// same gesture as a page block's handle (block-drag.ts), for the same reason:
// a native drag hands the drag image and the cursor to the browser, which
// showed the handle's icon as the dragged thing and its own cursor over the
// table. Here a copy of the dragged rows follows the pointer, the cursor
// stays "grabbing", and the pane scrolls near its top or bottom edge.
//
// The table keeps its own drop indicator: this module only reports which row
// the pointer is over, and on which half of it.

import { BLOCK_DRAGGING_CLASS } from "@/components/pages/block-drag";
import { scrollPane } from "@/lib/scroll-pane";

const DRAG_THRESHOLD = 4;
const AUTOSCROLL_EDGE = 48;
const AUTOSCROLL_STEP = 14;

export interface RowDropTarget {
  id: string;
  above: boolean;
}

/**
 * Starts tracking a press on a row's handle. Below the threshold nothing
 * happens and the press stays a click (the row's menu).
 */
export function trackRowDrag({
  start,
  table,
  dragged,
  onBegin,
  onTarget,
  onDrop,
  onEnd,
}: {
  start: MouseEvent;
  /** The table the rows belong to: the ghost copies its columns. */
  table: HTMLTableElement;
  /** The ids of the rows that move, in order. */
  dragged: readonly string[];
  onBegin: () => void;
  /** The row under the pointer, or null over a dragged row or outside. */
  onTarget: (target: RowDropTarget | null) => void;
  onDrop: (target: RowDropTarget) => void;
  onEnd: () => void;
}): void {
  const startX = start.clientX;
  const startY = start.clientY;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let target: RowDropTarget | null = null;
  let pointerX = startX;
  let pointerY = startY;
  let scrollFrame = 0;
  const pane = scrollPane(table);

  const begin = () => {
    dragging = true;
    document.documentElement.classList.add(BLOCK_DRAGGING_CLASS);
    // The copy keeps the table's look: its classes, its column widths and the
    // dragged rows' cells as they render.
    ghost = document.createElement("div");
    ghost.className = "block-drag-ghost";
    const copy = document.createElement("table");
    copy.className = table.className;
    copy.style.width = `${table.getBoundingClientRect().width}px`;
    const columns = table.querySelector("colgroup");
    if (columns) copy.appendChild(columns.cloneNode(true));
    const body = document.createElement("tbody");
    for (const id of dragged) {
      const row = table.querySelector(`tr[data-entry-id="${CSS.escape(id)}"]`);
      if (row) body.appendChild(row.cloneNode(true));
    }
    copy.appendChild(body);
    ghost.appendChild(copy);
    ghost.style.width = `${Math.min(table.getBoundingClientRect().width, 640)}px`;
    document.body.appendChild(ghost);
    onBegin();
  };

  const place = () => {
    if (ghost) ghost.style.transform = `translate(${Math.round(pointerX + 12)}px, ${Math.round(pointerY + 8)}px)`;
    const row = document
      .elementFromPoint(pointerX, pointerY)
      ?.closest<HTMLTableRowElement>("tr[data-entry-id]");
    const id = row && table.contains(row) ? row.dataset.entryId : undefined;
    if (!row || !id || dragged.includes(id)) {
      target = null;
    } else {
      const box = row.getBoundingClientRect();
      target = { id, above: pointerY < box.top + box.height / 2 };
    }
    onTarget(target);
  };

  const autoscroll = () => {
    scrollFrame = 0;
    if (!dragging) return;
    const box = pane === document.body ? { top: 0, bottom: window.innerHeight } : pane.getBoundingClientRect();
    const step =
      pointerY < box.top + AUTOSCROLL_EDGE ? -AUTOSCROLL_STEP
        : pointerY > box.bottom - AUTOSCROLL_EDGE ? AUTOSCROLL_STEP
          : 0;
    if (!step) return;
    (pane === document.body ? document.scrollingElement ?? document.documentElement : pane).scrollBy(0, step);
    place();
    scrollFrame = requestAnimationFrame(autoscroll);
  };

  const onMove = (event: MouseEvent) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (!dragging) {
      if (Math.hypot(pointerX - startX, pointerY - startY) < DRAG_THRESHOLD) return;
      begin();
    }
    event.preventDefault();
    place();
    if (!scrollFrame) scrollFrame = requestAnimationFrame(autoscroll);
  };

  const finish = () => {
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    window.removeEventListener("keydown", onKey, true);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    ghost?.remove();
    if (!dragging) return;
    document.documentElement.classList.remove(BLOCK_DRAGGING_CLASS);
    onTarget(null);
    onEnd();
    // The click that follows this mouseup would open the row's menu.
    const swallow = (event: MouseEvent) => event.stopPropagation();
    window.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
  };

  const onUp = () => {
    const at = target;
    const moved = dragging && at;
    finish();
    if (moved && at) onDrop(at);
  };

  // Escape cancels the drag without moving anything.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !dragging) return;
    event.preventDefault();
    target = null;
    finish();
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  window.addEventListener("keydown", onKey, true);
}
