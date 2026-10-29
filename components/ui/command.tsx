"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"

import { cn } from "@/lib/utils"
import { COARSE_ROW } from "./touch-target"
import { MobileSheetScrollArea } from "./mobile-sheet"
import { useListScrollFade, useMergedRef } from "./menu-scroll-fade"
import { useMobileLayout } from "@/lib/use-mobile-layout"
import {
  InputGroup,
  InputGroupAddon,
} from "./input-group"
import { SearchIcon } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckIcon } from "@hugeicons/core-free-icons"

function Command({
  className,
  onPointerMoveCapture,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
        className
      )}
      // cmdk moves its highlighted row on `pointermove` for every pointer
      // type, so a finger tapping or scrolling a list lit rows like a hover
      // (MIN-836). Only a mouse moves it, as in Radix menus; a tap still
      // selects through the item's click.
      onPointerMoveCapture={(event) => {
        onPointerMoveCapture?.(event)
        if (event.pointerType !== "mouse") event.stopPropagation()
      }}
      {...props}
    />
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0">
      {/* rounded-sm (12px), same as the rows: the field and the rows sit at the
          same 8px inset from a 20px surface, so they carry the same radius. */}
      <InputGroup className="h-8! rounded-sm! shadow-none! *:data-[slot=input-group-addon]:pl-2!">
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "w-full font-sans text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="size-4 shrink-0 opacity-50" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

/** Every mobile option list uses the same scroll fade, including model catalogs. */
function CommandList({
  className,
  ref,
  style,
  onScroll,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  // Rows hidden past an edge fade out there; the mobile sheet draws its own.
  const mobile = useMobileLayout() === true
  const fade = useListScrollFade<HTMLDivElement>()
  const mergedRef = useMergedRef(ref, mobile ? undefined : fade.ref)
  return (
    <MobileSheetScrollArea asChild>
      <CommandPrimitive.List
        data-slot="command-list"
        className={cn(
          "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
          className
        )}
        ref={mergedRef}
        style={mobile ? style : { ...fade.scrollProps.style, ...style }}
        onScroll={(event) => {
          onScroll?.(event)
          if (!mobile) fade.scrollProps.onScroll()
        }}
        {...props}
      />
    </MobileSheetScrollArea>
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        // rounded-sm (12px) — and the same 12px in a CommandDialog, whose
        // surface is the same 20px with the same 8px inset. The rounded-lg
        // override this used to carry counted only <Command>'s p-1 and missed
        // <CommandGroup>'s, so it drew 16px where 12px is concentric.
        `group/command-item relative flex min-h-8 max-[1199px]:min-h-10 ${COARSE_ROW} cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground`,
        className
      )}
      {...props}
    >
      {children}
      {/* Keep unchecked indicators out of the flex layout: consumers may provide
          their own trailing content or selection indicator. */}
      <HugeiconsIcon icon={CheckIcon} className="ml-auto hidden group-data-[checked=true]/command-item:block group-has-data-[slot=command-shortcut]/command-item:hidden" />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-data-selected/command-item:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
