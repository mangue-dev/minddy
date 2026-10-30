"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { escapeClosesMenusFirst } from "@/lib/escape-layers"
import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface"
import { OverlayOpenProvider, useFrozenWhileClosed, useOverlayOpen, useOverlayState } from "@/components/ui/overlay-freeze"
import { useMergedRef } from "@/components/ui/menu-scroll-fade"
import { listenOutsideClick } from "@/lib/overlay-dismiss"

function Popover({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const tracked = useOverlayOpen({ open, defaultOpen, onOpenChange })
  return (
    <OverlayOpenProvider open={tracked.open} onOpenChange={tracked.onOpenChange}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={tracked.onOpenChange}
        {...props}
      />
    </OverlayOpenProvider>
  )
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  container,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Portal target. Defaults to `document.body`. Pass a node inside a modal
   *  Dialog/Sheet so the content stays within `react-remove-scroll`'s allowed
   *  subtree (otherwise wheel/touch scrolling inside it is blocked). */
  container?: HTMLElement | null
}) {
  // A closing popover keeps what it showed (components/ui/overlay-freeze.tsx).
  const shown = useFrozenWhileClosed(children)
  // The node in state: Radix's portal mounts the content one render late.
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  const mergedRef = useMergedRef(ref, setNode)
  // Radix's own outside dismissal can be lost; this one runs the caller's
  // outside handlers the same way, so a caller that prevents them still keeps
  // the popover open (lib/overlay-dismiss.ts).
  const overlay = useOverlayState()
  const latest = React.useRef({ props, onOpenChange: overlay?.onOpenChange })
  React.useEffect(() => {
    latest.current = { props, onOpenChange: overlay?.onOpenChange }
  })
  const open = overlay?.open ?? false
  React.useEffect(() => {
    if (!open || !node) return
    return listenOutsideClick(node, (originalEvent) => {
      const event = new CustomEvent("minddy.popoverOutsideClick", {
        cancelable: true,
        detail: { originalEvent },
      })
      // Dispatched on the clicked element, as Radix does, so `event.target`
      // is that element for the handlers.
      originalEvent.target?.dispatchEvent(event)
      const { props: handlers, onOpenChange } = latest.current
      handlers.onPointerDownOutside?.(event as Parameters<NonNullable<typeof handlers.onPointerDownOutside>>[0])
      handlers.onInteractOutside?.(event as Parameters<NonNullable<typeof handlers.onInteractOutside>>[0])
      if (!event.defaultPrevented) onOpenChange?.(false)
    })
  }, [open, node])
  return (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 flex w-max min-w-(--radix-popover-trigger-width) origin-(--radix-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-border outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
        ref={mergedRef}
        onEscapeKeyDown={escapeClosesMenusFirst(props.onEscapeKeyDown)}
      >
        {shown}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
