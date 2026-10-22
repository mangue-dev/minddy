"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Drawer } from "vaul"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/use-media-query"
import { CloseButton } from "./close-button"
import { Sheet } from "./sheet"
import { MobileSheetContent, MobileSheetScrollArea } from "./mobile-sheet"
import { useMobileLayout } from "@/lib/use-mobile-layout"

/**
 * Minddy's side panel. The modal primitive (`ModalSidePanel*`) docks a panel to
 * an edge on desktop; the exported `SidePanel`, `SidePanelContent` and
 * `SidePanelBody` at the end hand it to the shared mobile sheet when the app
 * uses its mobile layout. Call sites only use the exported components.
 *
 * The modal primitive slides in from the edge and becomes a draggable bottom
 * sheet (vaul) below 480px — the same mode swap the <Dialog> uses. Compose it
 * with SidePanelHeader (which carries the close button), SidePanelBody (the
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
const SidePanelModeContext = React.createContext<{
  drawer: boolean
  onOpenChange?: (open: boolean) => void
}>({ drawer: false })

function useSidePanelMode() {
  return React.useContext(SidePanelModeContext).drawer
}

function ModalSidePanel({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const drawer = useMediaQuery("(max-width: 479px)")
  const Root = (drawer ? Drawer.Root : DialogPrimitive.Root) as React.ElementType
  return (
    <SidePanelModeContext.Provider value={{ drawer, onOpenChange }}>
      <Root data-slot="side-panel" onOpenChange={onOpenChange} {...props} />
    </SidePanelModeContext.Provider>
  )
}

function SidePanelTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const drawer = useSidePanelMode()
  const Trigger = (drawer ? Drawer.Trigger : DialogPrimitive.Trigger) as React.ElementType
  return <Trigger data-slot="side-panel-trigger" {...props} />
}

function SidePanelPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const drawer = useSidePanelMode()
  const Portal = (drawer ? Drawer.Portal : DialogPrimitive.Portal) as React.ElementType
  return <Portal data-slot="side-panel-portal" {...props} />
}

function SidePanelClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const drawer = useSidePanelMode()
  const Close = (drawer ? Drawer.Close : DialogPrimitive.Close) as React.ElementType
  return <Close data-slot="side-panel-close" {...props} />
}

function SidePanelOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { drawer, onOpenChange } = React.useContext(SidePanelModeContext)
  const Overlay = (drawer ? Drawer.Overlay : DialogPrimitive.Overlay) as React.ElementType
  return (
    <Overlay
      data-slot="side-panel-overlay"
      // In drawer mode vaul's overlay-tap dismiss is a no-op without snap
      // points, so close explicitly on a genuine scrim press (mirrors Dialog).
      onPointerDown={
        drawer
          ? (e: React.PointerEvent) => {
              if (e.target === e.currentTarget) onOpenChange?.(false)
            }
          : undefined
      }
      className={cn(
        // No `backdrop-filter`: a full-viewport blur re-composites the page on
        // every frame something moves behind the scrim, and under 10 % black
        // nobody sees it. The tint alone costs nothing per repaint.
        "fixed inset-0 isolate z-50 bg-black/10 duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        drawer && "bg-black/40",
        className
      )}
      {...props}
    />
  )
}

// Radix portals popover/dropdown/select content OUTSIDE the drawer's DOM; keep
// the sheet open when a pointer-down lands inside that floating content.
function isInsidePopperContent(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      '[data-radix-popper-content-wrapper],[data-slot="dropdown-menu-content"],[data-slot="select-content"],[role="menu"],[role="listbox"]',
    )
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
  /** Edge the panel docks to on desktop. Ignored in bottom-sheet mode. */
  side?: "left" | "right"
  /**
   * Let Radix move focus into the panel on open (its native behaviour). Off by
   * default so the panel doesn't steal focus from the trigger and doesn't fire
   * focus-triggered tooltips on the first focusable element. Escape / click
   * outside still close, and the focus-trap engages as soon as you Tab in.
   */
  autoFocusOnOpen?: boolean
}) {
  const drawer = useSidePanelMode()

  // Suppress Radix's open-focus by default; still forward the consumer's handler.
  const handleOpenAutoFocus = (event: Event) => {
    if (!autoFocusOnOpen) event.preventDefault()
    onOpenAutoFocus?.(event)
  }

  if (drawer) {
    return (
      <SidePanelPortal>
        <SidePanelOverlay />
        <Drawer.Content
          data-slot="side-panel-content"
          onOpenAutoFocus={handleOpenAutoFocus}
          onPointerDownOutside={(e) => {
            if (isInsidePopperContent(e.detail.originalEvent.target)) {
              e.preventDefault()
            }
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-border bg-card text-sm shadow-lg ring-1 ring-foreground/10 outline-none",
            className
          )}
          {...props}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          {children}
        </Drawer.Content>
      </SidePanelPortal>
    )
  }

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
          "fixed z-50 flex h-auto w-[min(460px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-card bg-clip-padding text-sm shadow-2xl outline-none transition duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150",
          SIDE_CLASSES[side],
          className
        )}
        {...props}
      >
        {children}
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
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border px-6 py-5 sm:flex-row sm:justify-end max-[479px]:pb-[max(1.25rem,env(safe-area-inset-bottom))]",
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
  const drawer = useSidePanelMode()
  const Title = (drawer ? Drawer.Title : DialogPrimitive.Title) as React.ElementType
  return (
    <Title
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
  const drawer = useSidePanelMode()
  const Description = (drawer ? Drawer.Description : DialogPrimitive.Description) as React.ElementType
  return (
    <Description
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
