"use client";

import { useEffect } from "react";
import { useDndMonitor } from "@dnd-kit/core";

/**
 * Keeps the grabbing cursor for the whole drag, wherever the pointer goes.
 * Drag overlays let the pointer through to what lies under them, so the
 * cursor fell back to whatever it crossed: a column, a link, an input.
 * Mounted inside a `DndContext`; app/globals.css draws the cursor from the
 * attribute it sets on the document.
 */
export function DragCursor() {
  const set = (on: boolean) => {
    if (on) document.documentElement.setAttribute("data-dragging", "");
    else document.documentElement.removeAttribute("data-dragging");
  };
  useDndMonitor({
    onDragStart: () => set(true),
    onDragEnd: () => set(false),
    onDragCancel: () => set(false),
  });
  // A context unmounted mid-drag must not leave the cursor behind.
  useEffect(() => () => set(false), []);
  return null;
}
