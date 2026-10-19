"use client";

// Anchors a popover at a viewport point (usually the mouse pointer) without a
// DOM node. A `position: fixed` span rendered in place stops being fixed to the
// viewport inside any transformed, filtered or `contain`ed ancestor — board
// cards are dnd-kit items — so the popover landed far from the cursor. A
// virtual anchor reports the point itself, whatever the surrounding layout.

import * as React from "react";
import { ResponsivePopoverAnchor } from "@/components/ui/responsive-popover";

export function PointerAnchor({ position }: { position: { x: number; y: number } }) {
  const latest = React.useRef(position);
  latest.current = position;
  const virtualRef = React.useRef({
    getBoundingClientRect: () => new DOMRect(latest.current.x, latest.current.y, 0, 0),
  });
  return <ResponsivePopoverAnchor virtualRef={virtualRef} />;
}
