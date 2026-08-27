"use client";

import * as React from "react";
import {
  Tooltip as MangueTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger as MangueTooltipTrigger,
} from "mangue-ui";
import {
  createWindowRefocusTracker,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";

/**
 * Minddy's tooltip wrapper adds two guards around the `mangue-ui` primitive.
 *
 * Radix opens a tooltip whenever its trigger receives focus. Browsers restore
 * focus when a background tab becomes active again, which used to reopen a
 * tooltip even though the user had not interacted with its trigger. The focus
 * policy lives in `lib/tooltip-focus.ts`.
 *
 * Some persistent controls enable a tooltip by changing `open` from `false` to
 * `undefined`. Passing that transition directly to Radix switches the primitive
 * between controlled and uncontrolled state, producing a warning on every
 * sidebar expansion. The wrapper below always controls the primitive while
 * preserving the intended opt-in behavior.
 *
 * Import tooltip primitives from this module, never directly from `mangue-ui`.
 */

const tracker = createWindowRefocusTracker();

if (typeof window !== "undefined") {
  // When the tab or application resumes, the next focus event comes from the
  // browser. `visibilitychange` covers browsers that do not focus the window.
  window.addEventListener("focus", tracker.markRefocus);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tracker.markRefocus();
  });
  // A user gesture restores the normal focus policy. Capture the gesture so the
  // flag is cleared before the focus event produced by that same interaction.
  const gesture = () => tracker.markGesture();
  window.addEventListener("keydown", gesture, { capture: true });
  window.addEventListener("pointerdown", gesture, { capture: true });
}

/**
 * Return whether the element matches `:focus-visible`. Browsers that do not
 * support the selector fall back to the previous behavior and allow opening.
 */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof MangueTooltip>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  );

  React.useEffect(() => {
    if (open !== undefined) setUncontrolledOpen(open);
  }, [open]);

  return (
    <MangueTooltip
      {...props}
      open={open ?? uncontrolledOpen}
      onOpenChange={(nextOpen) => {
        if (open === undefined) setUncontrolledOpen(nextOpen);
        onOpenChange?.(nextOpen);
      }}
    />
  );
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
        // `preventDefault` marks a React synthetic event as prevented even
        // though focus itself is not cancelable. Radix reads that flag before
        // opening, so the element keeps focus while the tooltip stays closed.
        if (!shouldOpenTooltipOnFocus(signal)) event.preventDefault();
      }}
      {...props}
    />
  );
}

export { TooltipContent, TooltipProvider };
