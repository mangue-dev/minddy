"use client";

import { focusMobileSheet } from "@/lib/mobile-sheet-focus";

import * as React from "react";
import { SidePanel as DesktopPanel, SidePanelContent as DesktopContent, Sheet, SheetContent, cn } from "mangue-ui";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const MobilePanel = React.createContext(false);
export function SidePanel(props: React.ComponentProps<typeof DesktopPanel>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : DesktopPanel;
  return <MobilePanel.Provider value={mobile}><Root {...props} /></MobilePanel.Provider>;
}
export function SidePanelContent({ className, side, onOpenAutoFocus, ...props }: React.ComponentProps<typeof DesktopContent>) {
  if (!React.useContext(MobilePanel)) return <DesktopContent className={className} side={side} onOpenAutoFocus={onOpenAutoFocus} {...props} />;
  return <SheetContent {...props} side="bottom" showCloseButton={false} onOpenAutoFocus={(event) => { onOpenAutoFocus?.(event); focusMobileSheet(event); }}
    className={cn("mobile-bottom-sheet mobile-side-panel-sheet gap-0 p-0", className)} />;
}
export { SidePanelBody, SidePanelClose, SidePanelDescription, SidePanelFooter, SidePanelHeader, SidePanelTitle, SidePanelTrigger } from "mangue-ui";
