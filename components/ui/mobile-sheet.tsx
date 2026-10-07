"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { useTranslations } from "next-intl";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button, SheetClose, SheetContent, cn } from "mangue-ui";
import { AppIcon } from "@/components/icon";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { focusMobileSheet } from "@/lib/mobile-sheet-focus";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { ScrollFadeEdges } from "@/components/scroll-fade-edges";

/** Shared mobile chrome; custom dismissal guards still own onOpenChange. */
export function MobileSheetContent({ children, className, onOpenAutoFocus, showCloseButton = true, ...props }: React.ComponentProps<typeof SheetContent>) {
  const mobile = useMobileLayout() === true;
  return <SheetContent {...props} showCloseButton={mobile ? false : showCloseButton}
    onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); if (mobile) focusMobileSheet(event); }}
    data-mobile-sheet={mobile ? "" : undefined}
    className={cn(mobile && "mobile-bottom-sheet", className)}>
    {children}
    {mobile && showCloseButton && <MobileSheetClose />}
  </SheetContent>;
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
  const Content = asChild ? Slot.Root : "div";
  if (!mobile) return <Content {...props} className={className}>{children}</Content>;
  return <div data-mobile-sheet-scroll className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
    <Content {...props} ref={ref} onScroll={(event) => { props.onScroll?.(event); scrollProps.onScroll(); }}
      className={cn("min-h-0 overflow-y-auto overscroll-contain", className)}>{children}</Content>
    <ScrollFadeEdges edges={edges} from="from-card" className="z-10 h-4" />
  </div>;
}
