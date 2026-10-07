"use client";

import { focusMobileSheet } from "@/lib/mobile-sheet-focus";

import * as React from "react";
import {
  Dialog as DesktopDialog, DialogContent as DesktopContent,
  DialogTrigger as DesktopTrigger, DialogClose as DesktopClose,
  DialogTitle as DesktopTitle, DialogDescription as DesktopDescription,
  DialogHeader, DialogFooter, Sheet, SheetContent, SheetTrigger, SheetClose,
  SheetTitle, SheetDescription, cn,
} from "mangue-ui";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const MobileDialog = React.createContext(false);
export function Dialog(props: React.ComponentProps<typeof DesktopDialog>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : DesktopDialog;
  return <MobileDialog.Provider value={mobile}><Root {...props} /></MobileDialog.Provider>;
}
export function DialogTrigger(props: React.ComponentProps<typeof DesktopTrigger>) {
  const Trigger = React.useContext(MobileDialog) ? SheetTrigger : DesktopTrigger;
  return <Trigger {...props} />;
}
export function DialogClose(props: React.ComponentProps<typeof DesktopClose>) {
  const Close = React.useContext(MobileDialog) ? SheetClose : DesktopClose;
  return <Close {...props} />;
}
export function DialogTitle(props: React.ComponentProps<typeof DesktopTitle>) {
  const Title = React.useContext(MobileDialog) ? SheetTitle : DesktopTitle;
  return <Title {...props} />;
}
export function DialogDescription(props: React.ComponentProps<typeof DesktopDescription>) {
  const Description = React.useContext(MobileDialog) ? SheetDescription : DesktopDescription;
  return <Description {...props} />;
}
export function DialogContent({ className, onOpenAutoFocus, ...props }: React.ComponentProps<typeof DesktopContent>) {
  const mobile = React.useContext(MobileDialog);
  if (!mobile) return <DesktopContent className={className} onOpenAutoFocus={onOpenAutoFocus} {...props} />;
  return <SheetContent side="bottom" onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); focusMobileSheet(event); }} data-mobile-dialog
    className={cn("mobile-bottom-sheet gap-4 p-4", className)} {...props} />;
}
export { DialogHeader, DialogFooter };
