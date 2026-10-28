"use client";

// The side panel a page is read in without leaving the current screen: a
// database entry previewed from its table (components/pages/pages-shell.tsx)
// and a page opened from a link anywhere in the app (MIN-777,
// components/global-page-panel.tsx). Both offer the same two ways out: Expand
// to the full page, or close back to what was underneath.

import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, ExpandIcon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { SidePanel, SidePanelContent, SidePanelTitle } from "@/components/ui/side-panel";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";

export function PagePeekPanel({
  open,
  title,
  expandLabel,
  onExpand,
  onClose,
  actionsSlot,
  children,
}: {
  open: boolean;
  /** Read by assistive technology only: the page shows its own title. */
  title: string;
  expandLabel: string;
  onExpand: () => void;
  onClose: () => void;
  /** Receives the element between Expand and Close where the page puts its
      own menu (PageView's `panelMenu`). */
  actionsSlot?: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const tCommon = useTranslations("Common");
  return (
    <SidePanel open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SidePanelContent
        className="flex w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden p-0 data-[vaul-drawer-direction=bottom]:w-full"
        onInteractOutside={keepOverlayOpenForPopper}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-database-cell-editor]"))
            event.preventDefault();
        }}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
          <SidePanelTitle className="sr-only">{title}</SidePanelTitle>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onExpand}>
            <HugeiconsIcon icon={ExpandIcon} className="size-3.5" />
            {expandLabel}
          </Button>
          {actionsSlot ? <div ref={actionsSlot} className="flex items-center" /> : null}
          <Button variant="ghost" size="icon-sm" aria-label={tCommon("close")} shortcut={["Esc"]} onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
        {children}
      </SidePanelContent>
    </SidePanel>
  );
}
