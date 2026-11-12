"use client";

// The side panel a page is read in without leaving the current screen: a
// database entry previewed from its table (components/pages/pages-shell.tsx)
// and a page opened from a link anywhere in the app (MIN-777,
// components/global-page-panel.tsx). Both offer the same ways out: Expand to
// the full page, open it in a new tab from Expand's menu (not on the phone,
// which has no tabs), or close back to what was underneath.

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Cancel01Icon, ExpandIcon, LinkSquare01Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { SidePanel, SidePanelContent, SidePanelTitle } from "@/components/ui/side-panel";
import { SplitButton } from "@/components/ui/split-button";
import { useOptionalAppTabSession } from "@/lib/app-tab-session-context";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";

export function PagePeekPanel({
  open,
  title,
  expandLabel,
  onExpand,
  newTabHref,
  beforeNewTab,
  onClose,
  onBack,
  actionsSlot,
  children,
}: {
  open: boolean;
  /** Read by assistive technology only: the page shows its own title. */
  title: string;
  expandLabel: string;
  onExpand: () => void;
  /** The shown page's address (lib/app-urls.ts), opened in a new tab from
      Expand's menu while the panel stays as it is. */
  newTabHref: string;
  /** Saves what was typed in the panel first; false keeps the tab unopened. */
  beforeNewTab?: () => Promise<boolean>;
  onClose: () => void;
  /** Returns to the page the shown one was opened from, when there is one. */
  onBack?: () => void;
  /** Receives the element between Expand and Close where the page puts its
      own menu (PageView's `panelMenu`). */
  actionsSlot?: (element: HTMLElement | null) => void;
  children: ReactNode;
}) {
  const tCommon = useTranslations("Common");
  const tActions = useTranslations("CommandPaletteActions");
  // A tab of the desktop shell when there is one, a browser tab otherwise,
  // as the board's views open theirs (components/board-toolbar.tsx).
  const appTabs = useOptionalAppTabSession();
  // The phone has no tabs (MIN-967): Expand stands alone, without its menu.
  const mobile = useMobileLayout() === true;
  const openInNewTab = async () => {
    if (beforeNewTab && !(await beforeNewTab())) return;
    if (appTabs) void appTabs.create(newTabHref);
    else window.open(newTabHref, "_blank", "noopener,noreferrer");
  };
  return (
    <SidePanel open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SidePanelContent
        className="flex w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        onInteractOutside={keepOverlayOpenForPopper}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-database-cell-editor]"))
            event.preventDefault();
        }}
      >
        {/* As much room under the buttons as above them: the page scrolls
            under this header, and without it the content ran into them. */}
        <div className="flex shrink-0 items-center gap-2 px-4 py-3">
          <SidePanelTitle className="sr-only">{title}</SidePanelTitle>
          {onBack ? (
            <Button variant="ghost" size="icon-sm" aria-label={tCommon("back")} onClick={onBack}>
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
          ) : null}
          <div className="flex-1" />
          {mobile ? (
            <Button variant="outline" size="sm" onClick={onExpand}>
              <HugeiconsIcon icon={ExpandIcon} className="size-3.5" />
              {expandLabel}
            </Button>
          ) : (
            <SplitButton
              variant="outline"
              size="sm"
              onClick={onExpand}
              menuLabel={tCommon("moreActions")}
              menu={
                <DropdownMenuItem onSelect={() => void openInNewTab()}>
                  <HugeiconsIcon icon={LinkSquare01Icon} className="size-4" />
                  {tActions("openInNewTab")}
                </DropdownMenuItem>
              }
            >
              <HugeiconsIcon icon={ExpandIcon} className="size-3.5" />
              {expandLabel}
            </SplitButton>
          )}
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
