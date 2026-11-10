"use client"

import * as React from "react"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { INPUT_MODALITY_ATTRIBUTE } from "@/lib/keyboard-modality"
import { useOverlayCollisionPadding } from "@/components/ui/overlay-collision-padding"
import { useTooltipPortalContainer } from "@/components/ui/tooltip"

/**
 * A card that opens while its trigger is hovered (MIN-879): more about what
 * the pointer rests on, without a click or a navigation. It is for a mouse
 * only. Radix opens nothing on touch, so the trigger's own tap keeps its
 * meaning, and nothing in the card may be needed to use the page.
 *
 * The delays keep a pointer that only crosses a line of text from opening
 * cards, and let it move from the trigger into the card.
 */
const OPEN_DELAY_MS = 450
const CLOSE_DELAY_MS = 150

function HoverCard({
  openDelay = OPEN_DELAY_MS,
  closeDelay = CLOSE_DELAY_MS,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return (
    <HoverCardPrimitive.Root
      data-slot="hover-card"
      openDelay={openDelay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

/**
 * Focus opens the card only while the keyboard drives focus (Tab, as
 * lib/keyboard-modality.ts tracks it). A popover or menu focuses its first row
 * when it opens: after a click, that focus is nobody's aim, and the first
 * row's card must not open under a pointer resting elsewhere.
 */
function HoverCardTrigger({
  onFocus,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger
      data-slot="hover-card-trigger"
      onFocus={(event) => {
        onFocus?.(event)
        // Radix skips its own opening on a prevented event.
        if (!event.currentTarget.ownerDocument.documentElement.hasAttribute(INPUT_MODALITY_ATTRIBUTE)) {
          event.preventDefault()
        }
      }}
      {...props}
    />
  )
}

function HoverCardContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
  const defaultCollisionPadding = useOverlayCollisionPadding()
  // Inside the full-screen reader, a card portaled to the body would open
  // behind the top layer: it mounts in the reader, as tooltips do.
  const container = useTooltipPortalContainer()
  return (
    <HoverCardPrimitive.Portal container={container ?? undefined}>
      <HoverCardPrimitive.Content
        data-slot="hover-card-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding ?? defaultCollisionPadding}
        className={cn(
          // The stacking order lives with the floating surfaces' in
          // app/globals.css: above popovers and menus, whose rows it often
          // explains, below tooltips.
          "w-80 max-w-[calc(100vw-2rem)] origin-(--radix-hover-card-content-transform-origin) rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-border outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      />
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }
