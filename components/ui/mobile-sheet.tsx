"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { useTranslations } from "next-intl";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Button } from "./button";
import { SheetClose, SheetContent } from "./sheet";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/icon";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { focusMobileSheet } from "@/lib/mobile-sheet-focus";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { attachSheetSwipeDismiss } from "@/lib/sheet-swipe-dismiss";
import { useOverlayState } from "./overlay-freeze";
import { useMergedRef } from "./menu-scroll-fade";

/** Shared mobile chrome; custom dismissal guards still own onOpenChange. */
export function MobileSheetContent({ children, className, onOpenAutoFocus, showCloseButton = true, ref, ...props }: React.ComponentProps<typeof SheetContent>) {
  const mobile = useMobileLayout() === true;
  const swipeRef = useSwipeToDismiss(mobile);
  // A sheet taller than the screen scrolls as a whole: its content fades at
  // the edge that hides some (SheetEdgeFade). Lists inside a sheet have their
  // own edges, with chevrons (MobileSheetScrollArea).
  const fade = useScrollFade<HTMLDivElement>();
  const mergedRef = useMergedRef(ref, swipeRef, mobile ? holdEntranceUntilPainted : undefined, mobile ? fade.ref : undefined);
  const onScroll = props.onScroll;
  return <SheetContent {...props} ref={mergedRef} showCloseButton={mobile ? false : showCloseButton}
    onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); if (mobile) focusMobileSheet(event); }}
    onScroll={mobile ? (event) => { onScroll?.(event); fade.scrollProps.onScroll(); } : onScroll}
    data-mobile-sheet={mobile ? "" : undefined}
    className={cn(mobile && "mobile-bottom-sheet", className)}>
    {mobile && <SheetEdgeFade edge="start" visible={fade.edges.start} />}
    {children}
    {mobile && <SheetEdgeFade edge="end" visible={fade.edges.end} />}
    {mobile && showCloseButton && <MobileSheetClose />}
  </SheetContent>;
}

/**
 * The fade at an edge of a sheet that scrolls as a whole, over the content
 * that edge hides. The sheet is itself the scroller, so the fade is a sticky
 * child of it, of no height (a mask on the sheet would fade its surface too).
 *
 * It only shows in the layout every sheet has by default, a column that
 * starts at the top, where an empty child can give back the gap it adds: it
 * stays out of a sheet laid out otherwise rather than shift its content.
 */
function SheetEdgeFade({ edge, visible }: { edge: "start" | "end"; visible: boolean }) {
  const anchor = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<{ gap: number; left: number; right: number } | null>(null);
  React.useLayoutEffect(() => {
    const sheet = anchor.current?.parentElement;
    if (!sheet) return;
    const style = getComputedStyle(sheet);
    const column = style.display === "flex" && style.flexDirection === "column"
      && ["normal", "flex-start", "start"].includes(style.justifyContent);
    const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
    setBox(column && scrolls ? {
      gap: parseFloat(style.rowGap) || 0,
      left: parseFloat(style.paddingLeft) || 0,
      right: parseFloat(style.paddingRight) || 0,
    } : null);
  }, []);
  return <div ref={anchor} aria-hidden hidden={!box} data-sheet-edge-fade={edge}
    className={cn("pointer-events-none sticky z-10 h-0 shrink-0", edge === "start" ? "top-0" : "bottom-0")}
    style={box ? { [edge === "start" ? "marginBottom" : "marginTop"]: -box.gap } : undefined}>
    <div
      className={cn(
        "absolute h-8 from-card to-transparent transition-opacity duration-150 motion-reduce:transition-none",
        // A sticky child stops at the sheet's padding: the fade reaches
        // over it, to the sheet's own edge (the sheet tokens, app/globals.css).
        edge === "start"
          ? "top-[calc(-1*var(--mobile-sheet-top))] bg-gradient-to-b"
          : "bottom-[calc(-1*var(--mobile-sheet-bottom))] bg-gradient-to-t",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ left: -(box?.left ?? 0), right: -(box?.right ?? 0) }}
    />
  </div>;
}

/**
 * Holds a sheet's entrance on its first frame until the sheet has been
 * painted once (app/globals.css, `data-sheet-entering`). Its animation's clock
 * starts when the sheet mounts, but a heavy sheet (the command palette, with
 * its field taking the focus and the keyboard) is first painted a hundred
 * milliseconds later or more, by when most of the slide had run off screen:
 * the sheet seemed to appear near its place instead of rising.
 */
function holdEntranceUntilPainted(node: HTMLDivElement | null) {
  if (!node) return;
  node.setAttribute("data-sheet-entering", "");
  // The first frame runs before the paint that shows the sheet; the second, after it.
  requestAnimationFrame(() => requestAnimationFrame(() => node.removeAttribute("data-sheet-entering")));
}

/** A mobile sheet swiped down closes like its close button (lib/sheet-swipe-dismiss.ts). */
function useSwipeToDismiss(enabled: boolean): React.RefCallback<HTMLDivElement> {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const onOpenChange = useOverlayState()?.onOpenChange;
  const close = React.useRef(onOpenChange);
  React.useEffect(() => { close.current = onOpenChange; }, [onOpenChange]);
  const active = enabled && onOpenChange !== undefined;
  React.useEffect(() => {
    if (!node || !active) return;
    return attachSheetSwipeDismiss(node, () => close.current?.(false));
  }, [node, active]);
  return setNode;
}

export function MobileSheetClose() {
  const t = useTranslations("Common");
  return <SheetClose asChild>
    <Button type="button" variant="ghost" size="icon" data-mobile-sheet-close data-slot="sheet-close" aria-label={t("close")}>
      <AppIcon icon={Cancel01Icon} className="size-4" />
    </Button>
  </SheetClose>;
}

/** Fades are siblings of the scrolling layer and never intercept row taps. */
export function MobileSheetScrollArea({ children, asChild = false, className, ...props }: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const mobile = useMobileLayout() === true;
  const { ref, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const Content = asChild ? Slot : "div";
  if (!mobile) return <Content {...props} className={className}>{children}</Content>;
  return <div data-mobile-sheet-scroll className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <Content {...props} ref={ref} onScroll={(event) => { props.onScroll?.(event); scrollProps.onScroll(); }}
      className={cn("min-h-0 overflow-y-auto overscroll-contain", className)}>{children}</Content>
    <SheetScrollEdge edge="start" visible={edges.start} />
    <SheetScrollEdge edge="end" visible={edges.end} />
  </div>;
}

/**
 * The edge of a sheet's list that hides rows: the same fade and chevron as a
 * menu's (components/ui/menu-scroll-fade.tsx), in the sheet's own colour,
 * only on the side more rows wait.
 */
function SheetScrollEdge({ edge, visible }: { edge: "start" | "end"; visible: boolean }) {
  return <div aria-hidden data-sheet-scroll-fade={edge} data-visible={visible ? "" : undefined}
    className={cn(
      "pointer-events-none absolute inset-x-0 z-10 flex h-8 justify-center from-card to-transparent text-muted-foreground transition-opacity duration-150 motion-reduce:transition-none",
      edge === "start" ? "top-0 items-start bg-gradient-to-b" : "bottom-0 items-end bg-gradient-to-t",
      visible ? "opacity-100" : "opacity-0",
    )}>
    {edge === "start" ? <ChevronUpIcon className="mt-0.5 size-4" /> : <ChevronDownIcon className="mb-0.5 size-4" />}
  </div>;
}
