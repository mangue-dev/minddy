"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { escapeClosesMenusFirst } from "@/lib/escape-layers"
import { releasePoppersBelow } from "@/lib/overlay-dismiss"
import { CloseButton } from "./close-button"
import { Sheet } from "./sheet"
import { MobileSheetContent, MobileSheetScrollArea } from "./mobile-sheet"
import { useMobileLayout } from "@/lib/use-mobile-layout"
import { OverlayOpenProvider, useFrozenWhileClosed, useOverlayOpen } from "@/components/ui/overlay-freeze"

/**
 * Minddy's side panel. The modal primitive (`ModalSidePanel*`) docks a panel to
 * an edge on desktop; the exported `SidePanel`, `SidePanelContent` and
 * `SidePanelBody` at the end hand it to the shared mobile sheet when the app
 * uses its mobile layout. Call sites only use the exported components.
 *
 * The modal primitive slides in from the edge. Compose it with SidePanelHeader (which carries the close button), SidePanelBody (the
 * scrollable zone) and an optional SidePanelFooter.
 *
 *   <SidePanel open={open} onOpenChange={setOpen}>
 *     <SidePanelContent>
 *       <SidePanelHeader>
 *         <SidePanelTitle>Details</SidePanelTitle>
 *       </SidePanelHeader>
 *       <SidePanelBody>…</SidePanelBody>
 *       <SidePanelFooter>…</SidePanelFooter>
 *     </SidePanelContent>
 *   </SidePanel>
 */
function ModalSidePanel({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const tracked = useOverlayOpen({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={tracked.open} onOpenChange={tracked.onOpenChange}>
      <DialogPrimitive.Root data-slot="side-panel" open={open} defaultOpen={defaultOpen} onOpenChange={tracked.onOpenChange} {...props} />
    </OverlayOpenProvider>
  )
}

function SidePanelTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="side-panel-trigger" {...props} />
}

function SidePanelPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="side-panel-portal" {...props} />
}

function SidePanelClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="side-panel-close" {...props} />
}

function SidePanelOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="side-panel-overlay"
      className={cn(
        // The one modal scrim (`--overlay-scrim`, MIN-931), docked panel and
        // sheet alike. No `backdrop-filter`: a full-viewport blur
        // re-composites the page on every frame something moves behind the
        // scrim. The tint alone costs nothing per repaint.
        "fixed inset-0 isolate z-50 bg-scrim duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

const SIDE_CLASSES: Record<"left" | "right", string> = {
  right:
    "inset-y-4 right-4 data-open:slide-in-from-right-full data-closed:slide-out-to-right-full",
  left: "inset-y-4 left-4 data-open:slide-in-from-left-full data-closed:slide-out-to-left-full",
}

function ModalSidePanelContent({
  className,
  children,
  side = "right",
  autoFocusOnOpen = false,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  /** Edge the panel docks to on desktop. */
  side?: "left" | "right"
  /**
   * Let Radix move focus into the panel on open (its native behaviour). Off by
   * default so the panel doesn't steal focus from the trigger and doesn't fire
   * focus-triggered tooltips on the first focusable element. Escape / click
   * outside still close, and the focus-trap engages as soon as you Tab in.
   */
  autoFocusOnOpen?: boolean
}) {
  // Suppress Radix's open-focus by default; still forward the consumer's handler.
  const handleOpenAutoFocus = (event: Event) => {
    if (!autoFocusOnOpen) event.preventDefault()
    onOpenAutoFocus?.(event)
    releasePoppersBelow(event)
  }
  // A closing panel keeps what it showed (components/ui/overlay-freeze.tsx).
  const shown = useFrozenWhileClosed(children)

  return (
    <SidePanelPortal>
      <SidePanelOverlay />
      <DialogPrimitive.Content
        data-slot="side-panel-content"
        data-side={side}
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          // Floating panel: detached from the screen edges with a 1rem margin,
          // rounded corners, border and elevation.
          "fixed z-50 flex h-auto w-[min(460px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-card bg-clip-padding text-sm shadow-2xl outline-none transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-180 data-closed:ease-in",
          SIDE_CLASSES[side],
          className
        )}
        {...props}
        onEscapeKeyDown={escapeClosesMenusFirst(props.onEscapeKeyDown)}
      >
        {shown}
      </DialogPrimitive.Content>
    </SidePanelPortal>
  )
}

function SidePanelHeader({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean }) {
  return (
    <div
      data-slot="side-panel-header"
      className={cn(
        "flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      {showCloseButton && (
        <SidePanelClose asChild>
          <CloseButton className="-mr-1.5 -mt-1 shrink-0 rounded-full text-muted-foreground hover:text-foreground" />
        </SidePanelClose>
      )}
    </div>
  )
}

function ModalSidePanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-body"
      className={cn("flex-1 overflow-y-auto px-6 py-5", className)}
      {...props}
    />
  )
}

function SidePanelFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="side-panel-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-5 sm:flex-row sm:justify-end max-[479px]:pb-[max(1.25rem,var(--mobile-sheet-safe-bottom,env(safe-area-inset-bottom)))]",
        className
      )}
      {...props}
    />
  )
}

function SidePanelTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="side-panel-title"
      className={cn("text-base leading-tight font-medium", className)}
      {...props}
    />
  )
}

function SidePanelDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="side-panel-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/* Exported panel: the mobile layout swaps the modal for the shared sheet. */

const MobilePanel = React.createContext(false);
function SidePanel(props: React.ComponentProps<typeof ModalSidePanel>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : ModalSidePanel;
  return <MobilePanel.Provider value={mobile}><Root {...props} /></MobilePanel.Provider>;
}
function SidePanelContent({ className, side, onOpenAutoFocus, ...props }: React.ComponentProps<typeof ModalSidePanelContent>) {
  if (!React.useContext(MobilePanel)) return <ModalSidePanelContent className={className} side={side} onOpenAutoFocus={onOpenAutoFocus} {...props} />;
  return <MobileSheetContent {...props} side="bottom" showCloseButton={false} onOpenAutoFocus={onOpenAutoFocus}
    className={cn("mobile-bottom-sheet mobile-side-panel-sheet gap-0 p-0", className)} />;
}
function SidePanelBody(props: React.ComponentProps<typeof ModalSidePanelBody>) {
  return <MobileSheetScrollArea asChild><ModalSidePanelBody {...props} /></MobileSheetScrollArea>;
}

export {
  SidePanel,
  SidePanelTrigger,
  SidePanelClose,
  SidePanelContent,
  SidePanelHeader,
  SidePanelBody,
  SidePanelFooter,
  SidePanelTitle,
  SidePanelDescription,
}
