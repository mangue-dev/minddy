"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { escapeClosesMenusFirst } from "@/lib/escape-layers"
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
 * - the modal primitive below (`ModalDialog*`): a centered modal;
 * - the exported `Dialog*` components at the end, which hand the whole dialog to
 *   the shared mobile sheet (components/ui/mobile-sheet.tsx) when the app uses
 *   its mobile layout, as every phone does.
 *
 * Call sites only use the exported components.
 */
function ModalDialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const tracked = useOverlayOpen({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={tracked.open} onOpenChange={tracked.onOpenChange}>
      <DialogPrimitive.Root data-slot="dialog" open={open} defaultOpen={defaultOpen} onOpenChange={tracked.onOpenChange} {...props} />
    </OverlayOpenProvider>
  )
}

function ModalDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function ModalDialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function ModalDialogClose({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" className={cn(COARSE_INSET_HIT_AREA, className)} {...props} />
}

function ModalDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // The one modal scrim, dialog and sheet alike (`--overlay-scrim`,
        // MIN-931). No `backdrop-filter`: see the note on
        // SidePanelOverlay.
        "fixed inset-0 isolate z-50 bg-scrim duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
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
  const handleOpenAutoFocus = (event: Event) => {
    onOpenAutoFocus?.(event)
    releasePoppersBelow(event)
  }
  // A closing dialog keeps what it showed (components/ui/overlay-freeze.tsx).
  const shown = useFrozenWhileClosed(children)

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
  return (
    <DialogPrimitive.Title
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
  return (
    <DialogPrimitive.Description
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
