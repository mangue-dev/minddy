"use client";

import { MobileSheetContent, MobileSheetScrollArea } from "./mobile-sheet";

import * as React from "react";
import { SidePanel as DesktopPanel, SidePanelContent as DesktopContent, SidePanelBody as DesktopBody, Sheet, cn } from "mangue-ui";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const MobilePanel = React.createContext(false);
export function SidePanel(props: React.ComponentProps<typeof DesktopPanel>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : DesktopPanel;
  return <MobilePanel.Provider value={mobile}><Root {...props} /></MobilePanel.Provider>;
}
export function SidePanelContent({ className, side, onOpenAutoFocus, ...props }: React.ComponentProps<typeof DesktopContent>) {
  if (!React.useContext(MobilePanel)) return <DesktopContent className={className} side={side} onOpenAutoFocus={onOpenAutoFocus} {...props} />;
  return <MobileSheetContent {...props} side="bottom" showCloseButton={false} onOpenAutoFocus={onOpenAutoFocus}
    className={cn("mobile-bottom-sheet mobile-side-panel-sheet gap-0 p-0", className)} />;
}
export function SidePanelBody(props: React.ComponentProps<typeof DesktopBody>) {
  return <MobileSheetScrollArea asChild><DesktopBody {...props} /></MobileSheetScrollArea>;
}
export { SidePanelClose, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle, SidePanelTrigger } from "mangue-ui";
