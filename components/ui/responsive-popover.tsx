"use client";

import { MobileSheetContent } from "./mobile-sheet";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Popover as DesktopPopover, PopoverTrigger as DesktopTrigger,
  PopoverContent as DesktopContent, PopoverAnchor as DesktopAnchor,
  Sheet, SheetTrigger, SheetTitle, cn,
} from "mangue-ui";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const MobilePopover = React.createContext(false);
export function Popover(props: React.ComponentProps<typeof DesktopPopover>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : DesktopPopover;
  return <MobilePopover.Provider value={mobile}><Root {...props} modal={mobile || props.modal} /></MobilePopover.Provider>;
}
export function PopoverTrigger(props: React.ComponentProps<typeof DesktopTrigger>) {
  const Trigger = React.useContext(MobilePopover) ? SheetTrigger : DesktopTrigger;
  return <Trigger {...props} />;
}
export function PopoverAnchor(props: React.ComponentProps<typeof DesktopAnchor>) {
  const mobile = React.useContext(MobilePopover);
  return mobile ? null : <DesktopAnchor {...props} />;
}
export function PopoverContent({ className, onOpenAutoFocus, container, align, side, sideOffset, alignOffset, avoidCollisions, collisionPadding, collisionBoundary, sticky, hideWhenDetached, arrowPadding, updatePositionStrategy, mobileTitle, ...props }: React.ComponentProps<typeof DesktopContent> & { mobileTitle?: React.ReactNode }) {
  const mobile = React.useContext(MobilePopover);
  const t = useTranslations("Picker");
  if (!mobile) return <DesktopContent onOpenAutoFocus={onOpenAutoFocus} {...{ className, container, align, side, sideOffset, alignOffset, avoidCollisions, collisionPadding, collisionBoundary, sticky, hideWhenDetached, arrowPadding, updatePositionStrategy }} {...props} />;
  return <MobileSheetContent {...props} side="bottom" onOpenAutoFocus={onOpenAutoFocus} aria-describedby={undefined}
    data-mobile-picker className={cn("mobile-bottom-sheet mobile-picker-sheet gap-0 p-2 pt-12", className)}>
    <SheetTitle className={mobileTitle ? "mobile-picker-title truncate" : "sr-only"}>{mobileTitle ?? t("search")}</SheetTitle>
    {props.children}
  </MobileSheetContent>;
}
