"use client"

import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/lib/use-media-query"
import { Button } from "./button"

// Below 480px the alert dialog is styled as a bottom sheet. Radix alert dialogs
// are intentionally non-dismissible on outside click; in sheet mode we opt into
// tap-to-close on the scrim above the sheet (parity with the Dialog drawer).
const AlertDialogSheetContext = React.createContext<{
  sheet: boolean
  onOpenChange?: (open: boolean) => void
}>({ sheet: false })

function AlertDialog({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const sheet = useMediaQuery("(max-width: 479px)")
  return (
    <AlertDialogSheetContext.Provider value={{ sheet, onOpenChange }}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        onOpenChange={onOpenChange}
        {...props}
      />
    </AlertDialogSheetContext.Provider>
  )
}

function AlertDialogTrigger({
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
  const { sheet, onOpenChange } = React.useContext(AlertDialogSheetContext)
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      // Tap the scrim above the sheet to dismiss (sheet mode only).
      onClick={sheet ? () => onOpenChange?.(false) : undefined}
      className={cn(
        // No `backdrop-filter` — see the note on SidePanelOverlay.
        "fixed inset-0 z-50 bg-black/10 duration-200 data-closed:duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 max-[479px]:bg-black/40",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = "default",
  overFloatingSurface = false,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
  /** Opened from a popover or menu, which floating surfaces lift to z-index
      1000 (app/globals.css): the scrim and the card rise above it. */
  overFloatingSurface?: boolean
}) {
  const layer = overFloatingSurface ? "over-floating" : undefined
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay data-layer={layer} />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-layer={layer}
        data-size={size}
        className={cn(
          "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full max-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] overflow-y-auto -translate-x-1/2 -translate-y-1/2 gap-4 rounded-[2rem] bg-card p-6 ring-1 ring-foreground/10 duration-200 ease-out outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.98] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.98] data-closed:duration-150 data-closed:ease-in",
          // Bottom sheet below 480px: dock to the bottom edge, full width,
          // rounded top, slide up/down instead of zoom-from-center. Padding stays
          // p-4 on the sheet (the desktop modal is the more spacious one).
          "max-[479px]:inset-x-0 max-[479px]:bottom-0 max-[479px]:top-auto max-[479px]:left-0 max-[479px]:max-h-[92dvh] max-[479px]:!w-full max-[479px]:!max-w-none max-[479px]:translate-x-0 max-[479px]:translate-y-0 max-[479px]:rounded-b-none max-[479px]:rounded-t-2xl max-[479px]:p-4 max-[479px]:pb-[max(1rem,env(safe-area-inset-bottom))] max-[479px]:data-open:zoom-in-100 max-[479px]:data-closed:zoom-out-100 max-[479px]:data-open:slide-in-from-bottom-6 max-[479px]:data-closed:slide-out-to-bottom-6",
          className
        )}
        {...props}
      />
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

function AlertDialogTitle({
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

function AlertDialogDescription({
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

function AlertDialogAction({
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

function AlertDialogCancel({
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
