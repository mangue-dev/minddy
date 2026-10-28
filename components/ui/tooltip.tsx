"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import {
  createWindowRefocusTracker,
  isFocusNavigationKey,
  shouldOpenTooltipOnFocus,
} from "@/lib/tooltip-focus";
import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface";

/**
 * Minddy's tooltip primitives, built on Radix with two guards.
 *
 * Radix opens a tooltip whenever its trigger receives focus. Browsers restore
 * focus when a background tab becomes active again, which used to reopen a
 * tooltip even though the user had not interacted with its trigger. The focus
 * policy lives in `lib/tooltip-focus.ts`.
 *
 * Some persistent controls enable a tooltip by changing `open` from `false` to
 * `undefined`. Passing that transition directly to Radix switches the primitive
 * between controlled and uncontrolled state, producing a warning on every
 * sidebar expansion. `Tooltip` below always controls the primitive while
 * preserving the intended opt-in behavior.
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
  window.addEventListener(
    "keydown",
    (event) => tracker.markGesture(isFocusNavigationKey(event.key)),
    { capture: true },
  );
  window.addEventListener("pointerdown", () => tracker.markGesture(), {
    capture: true,
  });
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

/**
 * The application mounts a single `TooltipProvider` at its root.
 *
 * Radix scopes its skip-delay (once one tooltip is open, the next ones appear
 * instantly) to a provider, so one provider per tooltip would make every hover
 * pay the full delay again. A tooltip without a provider above it makes Radix
 * throw, so a missing root provider surfaces on the first render.
 */
export function TooltipProvider({
  delayDuration = 200,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    >
      <TooltipScopeContext.Provider value={PROVIDED_SCOPE}>
        {children}
      </TooltipScopeContext.Provider>
    </TooltipPrimitive.Provider>
  );
}

/**
 * Where a control sits relative to tooltips. Controls that label themselves
 * (an icon-only `Button` shows its `aria-label`) read it to know whether a
 * tooltip can open here at all (a provider is mounted) and whether a caller
 * already wraps them in a richer one (they sit inside a `TooltipTrigger`).
 */
type TooltipScope = { provided: boolean; insideTrigger: boolean };
const TooltipScopeContext = React.createContext<TooltipScope>({
  provided: false,
  insideTrigger: false,
});
const PROVIDED_SCOPE: TooltipScope = { provided: true, insideTrigger: false };
const TRIGGER_SCOPE: TooltipScope = { provided: true, insideTrigger: true };

export function useTooltipScope(): TooltipScope {
  return React.useContext(TooltipScopeContext);
}

export function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  );

  React.useEffect(() => {
    if (open !== undefined) setUncontrolledOpen(open);
  }, [open]);

  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
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
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipScopeContext.Provider value={TRIGGER_SCOPE}>
      <TooltipPrimitive.Trigger
        data-slot="tooltip-trigger"
        onFocus={(event) => {
          onFocus?.(event);
          if (event.defaultPrevented) return;
          const signal = {
            refocusPending: tracker.consumeRefocus(),
            focusVisible: isFocusVisible(event.currentTarget),
            navigationKey: tracker.navigating,
          };
          // `preventDefault` marks a React synthetic event as prevented even
          // though focus itself is not cancelable. Radix reads that flag before
          // opening, so the element keeps focus while the tooltip stays closed.
          if (!shouldOpenTooltipOnFocus(signal)) event.preventDefault();
        }}
        {...props}
      />
    </TooltipScopeContext.Provider>
  );
}

/**
 * Where tooltips portal to, when not the body. A native modal `<dialog>`
 * (the image and file reader) sits in the browser's top layer, above every
 * z-index: a tooltip portaled to the body rendered BEHIND it. Such a surface
 * provides itself here, so its tooltips mount inside it.
 */
const TooltipPortalContainerContext = React.createContext<HTMLElement | null>(null);

export function TooltipPortalContainer({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <TooltipPortalContainerContext.Provider value={container}>
      {children}
    </TooltipPortalContainerContext.Provider>
  );
}

// `overflow-wrap: anywhere` breaks a word only when it cannot fit the width:
// a long file name or URL with no space wraps instead of leaving the bubble.
export function TooltipContent({
  className,
  sideOffset = 5,
  // A tooltip never touches the window's edges: it keeps 10 px from each.
  collisionPadding = OVERLAY_COLLISION_PADDING,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const container = React.useContext(TooltipPortalContainerContext);
  return (
    <TooltipPrimitive.Portal container={container ?? undefined}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-[60] max-w-[220px] rounded-md bg-foreground px-2.5 py-2 text-xs leading-snug text-background text-left [overflow-wrap:anywhere] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
