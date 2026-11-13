"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Sheet, SheetClose, SheetDescription, SheetTitle, SheetTrigger } from "./sheet"
import { MobileSheetContent } from "./mobile-sheet"
import { useMobileLayout } from "@/lib/use-mobile-layout"
import { OverlayOpenProvider, useFrozenWhileClosed, useOverlayOpen } from "@/components/ui/overlay-freeze"

function ModalAlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const tracked = useOverlayOpen({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={tracked.open} onOpenChange={tracked.onOpenChange}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={tracked.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function ModalAlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        // The one modal scrim (`--overlay-scrim`, MIN-931), dialog and sheet
        // alike. No `backdrop-filter` — see the note on SidePanelOverlay.
        "fixed inset-0 z-50 bg-scrim duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function ModalAlertDialogContent({
  className,
  size = "default",
  overFloatingSurface = false,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
  /** Opened from a popover or menu, which floating surfaces lift to z-index
      1000 (app/globals.css): the scrim and the card rise above it. */
  overFloatingSurface?: boolean
}) {
  const layer = overFloatingSurface ? "over-floating" : undefined
  // A closing alert keeps its text (components/ui/overlay-freeze.tsx).
  const shown = useFrozenWhileClosed(children)
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay data-layer={layer} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-layer={layer}
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[2rem] bg-card p-6 ring-1 ring-border duration-200 ease-out outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98] data-closed:duration-150 data-closed:ease-in",
          className
        )}
        {...props}
      >
        {shown}
      </AlertDialogPrimitive.Content>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )
}

function ModalAlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function ModalAlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function ModalAlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function ModalAlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

/* Exported alert dialog: the mobile layout hands it to the shared sheet, as
   `Dialog` does (components/ui/dialog.tsx). A confirmation on a phone is a
   sheet like any other: the grab handle, the close button, swipe to dismiss,
   the screen's corners and the side column of iPhone Duo. Its actions close
   it as Radix's do, unless their click handler prevents it (an action that
   waits for a request before closing). */

const MobileAlertDialog = React.createContext(false)

function AlertDialog(props: React.ComponentProps<typeof ModalAlertDialog>) {
  const mobile = useMobileLayout() === true
  const Root = mobile ? Sheet : ModalAlertDialog
  return <MobileAlertDialog.Provider value={mobile}><Root {...props} /></MobileAlertDialog.Provider>
}

function AlertDialogTrigger(props: React.ComponentProps<typeof ModalAlertDialogTrigger>) {
  const Trigger = React.useContext(MobileAlertDialog) ? SheetTrigger : ModalAlertDialogTrigger
  return <Trigger {...props} />
}

function AlertDialogContent({
  className,
  size = "default",
  overFloatingSurface = false,
  ...props
}: React.ComponentProps<typeof ModalAlertDialogContent>) {
  if (!React.useContext(MobileAlertDialog)) {
    return <ModalAlertDialogContent className={className} size={size} overFloatingSurface={overFloatingSurface} {...props} />
  }
  return (
    <MobileSheetContent
      side="bottom"
      role="alertdialog"
      data-mobile-dialog
      data-mobile-alert
      data-size={size}
      data-layer={overFloatingSurface ? "over-floating" : undefined}
      className={cn("group/alert-dialog-content mobile-bottom-sheet gap-4 p-4", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof ModalAlertDialogTitle>) {
  if (!React.useContext(MobileAlertDialog)) return <ModalAlertDialogTitle className={className} {...props} />
  return <SheetTitle data-slot="alert-dialog-title" className={cn("text-base font-medium", className)} {...props} />
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof ModalAlertDialogDescription>) {
  if (!React.useContext(MobileAlertDialog)) return <ModalAlertDialogDescription className={className} {...props} />
  // A sheet hides its description unless asked: a confirmation's says what
  // is about to happen.
  return (
    <SheetDescription
      data-slot="alert-dialog-description"
      data-sheet-keeps-description
      className={cn("text-sm text-balance text-muted-foreground *:[a]:underline *:[a]:underline-offset-3", className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ModalAlertDialogAction>) {
  if (!React.useContext(MobileAlertDialog)) {
    return <ModalAlertDialogAction className={className} variant={variant} size={size} {...props} />
  }
  return (
    <SheetClose asChild>
      <Button data-slot="alert-dialog-action" variant={variant} size={size} className={cn(className)} {...props} />
    </SheetClose>
  )
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<typeof ModalAlertDialogCancel>) {
  if (!React.useContext(MobileAlertDialog)) {
    return <ModalAlertDialogCancel className={className} variant={variant} size={size} {...props} />
  }
  return (
    <SheetClose asChild>
      <Button data-slot="alert-dialog-cancel" variant={variant} size={size} className={cn(className)} {...props} />
    </SheetClose>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
