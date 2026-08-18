"use client";

import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger as MangueTooltipTrigger,
} from "mangue-ui";
import {
  createWindowRefocusTracker,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * Minddy's tooltip — that of `mangue-ui`, minus her opening to focus
 * suffered.
 *
 * Radix opens the tooltip on any `focus` of the trigger. The browser returns
 * the focus on its own when the tab becomes active again: tooltips re-opened on buttons that no one had hovered over, when returning from a
 * another tab. The why, and the two rules that correct it, are written
 * in [lib/tooltip-focus.ts](../../lib/tooltip-focus.ts).
 *
 * **Import the tooltip from HERE, never from `mangue-ui`**: a `TooltipTrigger`
 * taken upstream reintroduces the fault, silently, on this surface
 * only. The rest (`Tooltip`, `TooltipContent`, `TooltipProvider`) is
 * re-exported as is so that the import fits in one line.
 *
 * TEMPORARY DUPLICATE, like `@/components/ui/kbd` before it: the same guard is
 * now IN the `TooltipTrigger` of mango-ui (0.5.2, unpublished), where
 * it also covers the tooltips that the package itself renders — that of the menu
 * “⋯” of the notebook tasks, for example `SearchMenu`, which this file cannot
 * reach. TO BE REMOVED as soon as minddy consumes a published version which has
 *: replace the imports with `mangue-ui` and delete this file.
 */

const tracker = createWindowRefocusTracker();

if (typeof window !== "undefined") {
  // Tab or application left then resumed: the following `focus` comes from
  // browser. `visibilitychange` doubles down — some changes
  // tabs do not pass through the `focus` of the window.
  window.addEventListener("focus", tracker.markRefocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tracker.markRefocus();
  });
  // A gesture, and the focus returns to its usual meaning. Captured: the flag
  // must fall before the `focus` triggered by this same gesture arrives.
  const gesture = () => tracker.markGesture();
  window.addEventListener("keydown", gesture, { capture: true });
  window.addEventListener("pointerdown", gesture, { capture: true });
}

/** True if the element has `:focus-visible`. A browser that does not know
 the selector raises to `matches` — we then fall back on “visible”,
, that is to say on the previous behavior. */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function TooltipTrigger({
  onFocus,
  ...props
}: React.ComponentProps<typeof MangueTooltipTrigger>) {
  return (
    <MangueTooltipTrigger
      onFocus={(event) => {
        onFocus?.(event);
        if (event.defaultPrevented) return;
        const signal = {
          refocusPending: tracker.consumeRefocus(),
          focusVisible: isFocusVisible(event.currentTarget),
        };
        // `preventDefault` on a React synthetic mark event
        // `defaultPrevented` even if `focus` is not cancelable, and that is
        // what does Radix's `composeEventHandlers` read to forgo opening.
        // The element keeps its focus: only the tooltip is retained.
        if (!shouldOpenTooltipOnFocus(signal)) event.preventDefault();
      }}
      {...props}
    />
  );
}

export { Tooltip, TooltipContent, TooltipProvider };
