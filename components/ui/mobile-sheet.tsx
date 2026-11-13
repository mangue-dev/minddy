"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { useTranslations } from "next-intl";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "./button";
import { SheetClose, SheetContent } from "./sheet";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/icon";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { focusMobileSheet } from "@/lib/mobile-sheet-focus";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";
import { attachSheetSwipeDismiss } from "@/lib/sheet-swipe-dismiss";
import { useOverlayState } from "./overlay-freeze";
import { useMergedRef } from "./menu-scroll-fade";

/** Shared mobile chrome; custom dismissal guards still own onOpenChange. */
export function MobileSheetContent({ children, className, onOpenAutoFocus, showCloseButton = true, ref, ...props }: React.ComponentProps<typeof SheetContent>) {
  const mobile = useMobileLayout() === true;
  const swipeRef = useSwipeToDismiss(mobile);
  const mergedRef = useMergedRef(ref, swipeRef, mobile ? holdEntranceUntilPainted : undefined);
  return <SheetContent {...props} ref={mergedRef} showCloseButton={mobile ? false : showCloseButton}
    onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); if (mobile) focusMobileSheet(event); }}
    data-mobile-sheet={mobile ? "" : undefined}
    className={cn(mobile && "mobile-bottom-sheet", className)}>
    {children}
    {mobile && showCloseButton && <MobileSheetClose />}
  </SheetContent>;
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
    <ScrollFadeEdges edges={edges} from="from-card" className="z-10 h-4" />
  </div>;
}
