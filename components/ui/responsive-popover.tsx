"use client";

import { MobileSheetContent } from "./mobile-sheet";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Popover as DesktopPopover,
  PopoverTrigger as DesktopTrigger,
  PopoverContent as DesktopContent,
  PopoverAnchor as DesktopAnchor,
} from "./popover";
import { Sheet, SheetTrigger, SheetTitle } from "./sheet";
import { cn } from "@/lib/utils";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { allowInputAutoFocus } from "@/lib/mobile-sheet-focus";

/**
 * A picker surface: the floating `Popover` on desktop, the shared bottom sheet
 * (with a title and search focus handling) in the mobile layout. Use the plain
 * `Popover` from `./popover` for surfaces that must stay anchored on mobile.
 */
const MobilePopover = React.createContext(false);
export function ResponsivePopover(props: React.ComponentProps<typeof DesktopPopover>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : DesktopPopover;
  return <MobilePopover.Provider value={mobile}><Root {...props} modal={mobile || props.modal} /></MobilePopover.Provider>;
}
export function ResponsivePopoverTrigger(props: React.ComponentProps<typeof DesktopTrigger>) {
  const Trigger = React.useContext(MobilePopover) ? SheetTrigger : DesktopTrigger;
  return <Trigger {...props} />;
}
export function ResponsivePopoverAnchor(props: React.ComponentProps<typeof DesktopAnchor>) {
  const mobile = React.useContext(MobilePopover);
  return mobile ? null : <DesktopAnchor {...props} />;
}
export function ResponsivePopoverContent({ className, onOpenAutoFocus, container, align, side, sideOffset, alignOffset, avoidCollisions, collisionPadding, collisionBoundary, sticky, hideWhenDetached, arrowPadding, updatePositionStrategy, mobileTitle, ...props }: React.ComponentProps<typeof DesktopContent> & { mobileTitle?: React.ReactNode }) {
  const mobile = React.useContext(MobilePopover);
  const t = useTranslations("Picker");
  if (!mobile) return <DesktopContent onOpenAutoFocus={(event) => focusSearchInputOnOpen(event, onOpenAutoFocus)} {...{ className, container, align, side, sideOffset, alignOffset, avoidCollisions, collisionPadding, collisionBoundary, sticky, hideWhenDetached, arrowPadding, updatePositionStrategy }} {...props} />;
  return <MobileSheetContent {...props} side="bottom" onOpenAutoFocus={onOpenAutoFocus} aria-describedby={undefined}
    data-mobile-picker className={cn("mobile-bottom-sheet mobile-picker-sheet gap-0 p-2 pt-12", className)}>
    <SheetTitle className={mobileTitle ? "mobile-picker-title truncate" : "sr-only"}>{mobileTitle ?? t("search")}</SheetTitle>
    {props.children}
  </MobileSheetContent>;
}

/**
 * Focus a popover's search field from Radix's open-autofocus event rather than
 * from the input's own `autoFocus`. Inside a Dialog or side panel, `autoFocus`
 * fires during React's commit, before the popover's focus scope pauses the
 * parent's focus trap; that trap sees focus leave its portal-less subtree and
 * pulls it back. The open-autofocus event runs once the popover scope is the
 * active one, so the focus sticks. A consumer handler that prevents the event
 * keeps the last word.
 */
function focusSearchInputOnOpen(event: Event, onOpenAutoFocus?: (event: Event) => void) {
  onOpenAutoFocus?.(event);
  if (event.defaultPrevented || !allowInputAutoFocus()) return;
  const container = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  const input = container?.querySelector<HTMLElement>("[cmdk-input], [data-popover-autofocus]");
  if (!input) return;
  event.preventDefault();
  input.focus({ preventScroll: true });
}
