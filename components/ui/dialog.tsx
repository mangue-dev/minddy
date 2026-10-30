"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Drawer } from "vaul"

import { cn } from "@/lib/utils"
import { escapeClosesMenusFirst } from "@/lib/escape-layers"
import { useMediaQuery } from "@/lib/use-media-query"
import { releasePoppersBelow } from "@/lib/overlay-dismiss"
import { Button } from "./button"
import { CloseButton } from "./close-button"
import { COARSE_INSET_HIT_AREA } from "./touch-target"
import { Sheet, SheetClose, SheetDescription, SheetTitle, SheetTrigger } from "./sheet"
import { MobileSheetContent } from "./mobile-sheet"
import { useMobileLayout } from "@/lib/use-mobile-layout"
import { OverlayOpenProvider, useFrozenWhileClosed, useOverlayOpen } from "@/components/ui/overlay-freeze"

/**
 * Minddy's dialog. Two layers live in this one file:
 *
 * - the modal primitive below (`ModalDialog*`): a centered modal, which falls
 *   back to a draggable vaul bottom sheet below 480px;
 * - the exported `Dialog*` components at the end, which hand the whole dialog to
 *   the shared mobile sheet when the app uses its mobile layout.
 *
 * Call sites only use the exported components.
 *
 * The modal's mode is decided once at the <ModalDialog> root and shared via
 * context so every sub-component (Trigger / Content / Title / …) renders the
 * matching primitive.
 */
const DialogModeContext = React.createContext<{
  drawer: boolean
  onOpenChange?: (open: boolean) => void
}>({
  drawer: false,
})

function useDialogMode() {
  return React.useContext(DialogModeContext).drawer
}

function ModalDialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const drawer = useMediaQuery("(max-width: 479px)")
  const tracked = useOverlayOpen({ open, defaultOpen, onOpenChange })
  const Root = (drawer ? Drawer.Root : DialogPrimitive.Root) as React.ElementType
  // vaul's keyboard handling misreads iOS Safari; app/globals.css anchors the
  // drawer above the keyboard instead (MIN-870).
  const drawerProps = drawer ? { repositionInputs: false } : {}
  return (
    <DialogModeContext.Provider value={{ drawer, onOpenChange: tracked.onOpenChange }}>
      <OverlayOpenProvider open={tracked.open} onOpenChange={tracked.onOpenChange}>
        <Root data-slot="dialog" {...drawerProps} open={open} defaultOpen={defaultOpen} onOpenChange={tracked.onOpenChange} {...props} />
      </OverlayOpenProvider>
    </DialogModeContext.Provider>
  )
}

function ModalDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  const drawer = useDialogMode()
  const Trigger = (drawer ? Drawer.Trigger : DialogPrimitive.Trigger) as React.ElementType
  return <Trigger data-slot="dialog-trigger" {...props} />
}

function ModalDialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const drawer = useDialogMode()
  const Portal = (drawer ? Drawer.Portal : DialogPrimitive.Portal) as React.ElementType
  return <Portal data-slot="dialog-portal" {...props} />
}

function ModalDialogClose({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  const drawer = useDialogMode()
  const Close = (drawer ? Drawer.Close : DialogPrimitive.Close) as React.ElementType
  return <Close data-slot="dialog-close" className={cn(COARSE_INSET_HIT_AREA, className)} {...props} />
}

function ModalDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { drawer, onOpenChange } = React.useContext(DialogModeContext)
  const Overlay = (drawer ? Drawer.Overlay : DialogPrimitive.Overlay) as React.ElementType
  return (
    <Overlay
      data-slot="dialog-overlay"
      // In drawer mode, vaul's overlay-tap dismiss is a no-op without snap
      // points, so close explicitly on a genuine scrim press. Use pointerdown
      // (not click) and require it to land directly on the overlay: tapping a
      // portaled dropdown/select item fires its pointerdown on the item — which
      // sits above this overlay — so the sheet stays open. A click handler would
      // instead catch the fall-through click after the item unmounts on select.
      onPointerDown={
        drawer
          ? (e: React.PointerEvent) => {
              if (e.target === e.currentTarget) onOpenChange?.(false)
            }
          : undefined
      }
      className={cn(
        // No `backdrop-filter` — see the note on SidePanelOverlay: a viewport-wide
        // blur repaints every frame, and under 10 % black it is invisible.
        "fixed inset-0 isolate z-50 bg-black/10 duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        drawer && "bg-black/40",
        className
      )}
      {...props}
    />
  )
}

// Radix portals popover/dropdown/select content OUTSIDE the drawer's DOM, and
// vaul's dismissable layer (a separate instance from radix-ui's) doesn't see it
// as a nested layer — so a pointer-down on an open dropdown/select reads as
// "outside" and dismisses the whole sheet. Detect those targets so we can keep
// the sheet open when the interaction lands inside floating popper content.
function isInsidePopperContent(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest(
      '[data-radix-popper-content-wrapper],[data-slot="dropdown-menu-content"],[data-slot="select-content"],[role="menu"],[role="listbox"]',
    )
  )
}

function ModalDialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const drawer = useDialogMode()
  const handleOpenAutoFocus = (event: Event) => {
    onOpenAutoFocus?.(event)
    releasePoppersBelow(event)
  }
  // A closing dialog keeps what it showed (components/ui/overlay-freeze.tsx).
  const shown = useFrozenWhileClosed(children)

  if (drawer) {
    return (
      <ModalDialogPortal>
        <ModalDialogOverlay />
        <Drawer.Content
          data-slot="dialog-content"
          onOpenAutoFocus={handleOpenAutoFocus}
          // Keep the sheet open when the pointer-down is inside an open
          // dropdown/select (its content is portaled outside this subtree).
          onPointerDownOutside={(e) => {
            if (isInsidePopperContent(e.detail.originalEvent.target)) {
              e.preventDefault()
            }
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex flex-col rounded-t-2xl border-t border-border bg-card text-sm outline-none ring-1 ring-border",
            className,
            // Override any width/height the call site set for the centered
            // dialog (max-w-*, h-[…]) — a bottom sheet is always full-width and
            // sized to its content (capped). Placed last so tailwind-merge wins.
            "inset-x-0 left-0 right-0 h-auto max-h-[92dvh] w-full max-w-none",
          )}
        >
          {/* Drag handle */}
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" />
          <div className="flex flex-col gap-4 overflow-y-auto p-4 pb-[max(1rem,var(--mobile-sheet-safe-bottom,env(safe-area-inset-bottom)))]">
            {shown}
          </div>
        </Drawer.Content>
      </ModalDialogPortal>
    )
  }

  return (
    <ModalDialogPortal>
      <ModalDialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onOpenAutoFocus={handleOpenAutoFocus}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[2rem] bg-card p-6 text-sm ring-1 ring-border duration-200 ease-out outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98] data-closed:duration-150 data-closed:ease-in",
          className
        )}
        {...props}
        onEscapeKeyDown={escapeClosesMenusFirst(props.onEscapeKeyDown)}
      >
        {shown}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <CloseButton
              className={`absolute top-4 right-4 z-10 size-7 rounded-full ${COARSE_INSET_HIT_AREA} bg-control text-muted-foreground hover:bg-control-hover hover:text-foreground`}
            />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </ModalDialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <ModalDialogClose asChild>
          <FooterCloseButton />
        </ModalDialogClose>
      )}
    </div>
  )
}

/** The footer's optional "Close", localized like the corner cross. */
function FooterCloseButton(props: React.ComponentProps<typeof Button>) {
  const t = useTranslations("Common")
  return (
    <Button variant="outline" {...props}>
      {t("close")}
    </Button>
  )
}

function ModalDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const drawer = useDialogMode()
  const Title = (drawer ? Drawer.Title : DialogPrimitive.Title) as React.ElementType
  return (
    <Title
      data-slot="dialog-title"
      className={cn("text-base leading-none font-medium", className)}
      {...props}
    />
  )
}

function ModalDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const drawer = useDialogMode()
  const Description = (drawer ? Drawer.Description : DialogPrimitive.Description) as React.ElementType
  return (
    <Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

/* Exported dialog: the mobile layout swaps the modal for the shared sheet. */

const MobileDialog = React.createContext(false);
export function Dialog(props: React.ComponentProps<typeof ModalDialog>) {
  const mobile = useMobileLayout() === true;
  const Root = mobile ? Sheet : ModalDialog;
  return <MobileDialog.Provider value={mobile}><Root {...props} /></MobileDialog.Provider>;
}
export function DialogTrigger(props: React.ComponentProps<typeof ModalDialogTrigger>) {
  const Trigger = React.useContext(MobileDialog) ? SheetTrigger : ModalDialogTrigger;
  return <Trigger {...props} />;
}
export function DialogClose(props: React.ComponentProps<typeof ModalDialogClose>) {
  const Close = React.useContext(MobileDialog) ? SheetClose : ModalDialogClose;
  return <Close {...props} />;
}
export function DialogTitle(props: React.ComponentProps<typeof ModalDialogTitle>) {
  const Title = React.useContext(MobileDialog) ? SheetTitle : ModalDialogTitle;
  return <Title {...props} />;
}
export function DialogDescription(props: React.ComponentProps<typeof ModalDialogDescription>) {
  const Description = React.useContext(MobileDialog) ? SheetDescription : ModalDialogDescription;
  return <Description {...props} />;
}
export function DialogContent({ className, onOpenAutoFocus, ...props }: React.ComponentProps<typeof ModalDialogContent>) {
  const mobile = React.useContext(MobileDialog);
  if (!mobile) return <ModalDialogContent className={className} onOpenAutoFocus={onOpenAutoFocus} {...props} />;
  return <MobileSheetContent side="bottom" onOpenAutoFocus={onOpenAutoFocus} data-mobile-dialog
    className={cn("mobile-bottom-sheet gap-4 p-4", className)} {...props} />;
}
export { DialogHeader, DialogFooter }
