"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { COARSE_ROW } from "./touch-target"
import { useMediaQuery } from "@/lib/use-media-query"
import { ChevronRightIcon } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CheckIcon } from "@hugeicons/core-free-icons"
import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface"
import { useMenuScrollFade, useMergedRef } from "@/components/ui/menu-scroll-fade"

// Below 768px, side-opening flyout submenus can't fit on narrow screens (Radix
// only flips them left/right and can't shift them horizontally to overlap the
// parent). So we render submenus inline — an accordion expanded within the
// parent menu. This context lets Sub / SubTrigger / SubContent coordinate.
const DropdownSubInlineContext = React.createContext<{
  inline: boolean
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

// A closed menu stays mounted for its exit animation. Radix still reacts to
// the pointer there: it focuses the item the pointer moves over and the menu
// when the pointer leaves an item, which happens as soon as the surface an
// item opened (a picker at the pointer) appears under a resting mouse. That
// focus leaves the new surface, and a popover then closes on its own. A
// prevented event skips Radix's handler, so a closing menu takes no focus.
type PointerHandler = React.PointerEventHandler<HTMLDivElement> | undefined

function inertWhileClosing(handler: PointerHandler): React.PointerEventHandler<HTMLDivElement> {
  return (event) => {
    handler?.(event)
    if (event.currentTarget.closest('[role="menu"]')?.getAttribute("data-state") === "closed") {
      event.preventDefault()
    }
  }
}

function closingMenuGuards({ onPointerMove, onPointerLeave }: { onPointerMove?: PointerHandler; onPointerLeave?: PointerHandler }) {
  return {
    onPointerMove: inertWhileClosing(onPointerMove),
    onPointerLeave: inertWhileClosing(onPointerLeave),
  }
}

// A searchable menu keeps the caret in its search field while the pointer
// moves over the options: Radix would focus each hovered option, then the
// menu itself on leave. Inside this scope a leaf option skips both (the same
// prevented event as above) and shows its hover with CSS instead; the arrow
// keys still move the focus through the options. Submenu triggers keep
// Radix's handling, which is what opens them on hover.
const DropdownMenuSearchFocusContext = React.createContext(false)

function DropdownMenuSearchScope({ children }: { children: React.ReactNode }) {
  return <DropdownMenuSearchFocusContext.Provider value>{children}</DropdownMenuSearchFocusContext.Provider>
}

function keepSearchFocus(handler: React.PointerEventHandler<HTMLDivElement>): React.PointerEventHandler<HTMLDivElement> {
  return (event) => {
    handler(event)
    if (event.pointerType !== "mouse") return
    // An open submenu closes when a sibling option takes the focus: let Radix
    // run that once, the next moves keep the search focus again.
    const menu = event.currentTarget.closest('[role="menu"]')
    if (menu?.querySelector(':scope [role="menuitem"][aria-expanded="true"]')) return
    event.preventDefault()
  }
}

function itemPointerGuards(props: { onPointerMove?: PointerHandler; onPointerLeave?: PointerHandler }, searchScope: boolean) {
  const guards = closingMenuGuards(props)
  if (!searchScope) return guards
  return {
    onPointerMove: keepSearchFocus(guards.onPointerMove),
    onPointerLeave: keepSearchFocus(guards.onPointerLeave),
  }
}

/** The hover a search-scoped option shows without taking the focus. */
const SEARCH_SCOPE_HOVER =
  "pointer-fine:hover:bg-accent pointer-fine:hover:text-accent-foreground data-[variant=destructive]:pointer-fine:hover:bg-destructive-surface-hover data-[variant=destructive]:pointer-fine:hover:text-destructive"

// `modal={false}` by default: the modal mode locks scroll on <body> and marks
// the rest of the page aria-hidden / pointer-events-none, which breaks scrolling
// behind the menu and layout (scrollbar-gone jump). Pass modal to opt back in.
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return (
    <DropdownMenuPrimitive.Root
      data-slot="dropdown-menu"
      modal={modal}
      {...props}
    />
  )
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 4,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  children,
  ref,
  onScroll,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  // Rows hidden past an edge fade out there (useMenuScrollFade).
  const fade = useMenuScrollFade<HTMLDivElement>()
  const mergedRef = useMergedRef(ref, fade.ref)
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        collisionPadding={collisionPadding}
        className={cn(
                                  "z-50 max-h-(--radix-dropdown-menu-content-available-height) w-max min-w-[max(var(--radix-dropdown-menu-trigger-width),12rem)] max-w-[calc(100vw-1rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-xl bg-popover scroll-py-10 p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:overflow-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                                  className
                                )}
        ref={mergedRef}
        onScroll={(event) => {
          onScroll?.(event)
          fade.onScroll()
        }}
        {...props}
      >
        {fade.start}
        {children}
        {fade.end}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  const searchScope = React.useContext(DropdownMenuSearchFocusContext)
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        `group/dropdown-menu-item relative flex min-h-8 max-[1199px]:min-h-10 ${COARSE_ROW} app-desktop:py-1.5! cursor-default items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive-surface-hover data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:data-highlighted:**:text-destructive data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive`,
        searchScope && SEARCH_SCOPE_HOVER,
        className
      )}
      {...props}
      {...itemPointerGuards(props, searchScope)}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        `relative flex min-h-8 max-[1199px]:min-h-10 ${COARSE_ROW} app-desktop:py-1.5! cursor-default items-center gap-1.5 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        className
      )}
      checked={checked}
      {...props}
      {...closingMenuGuards(props)}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <HugeiconsIcon icon={CheckIcon} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        `relative flex min-h-8 max-[1199px]:min-h-10 ${COARSE_ROW} app-desktop:py-1.5! cursor-default items-center gap-1.5 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        className
      )}
      {...props}
      {...closingMenuGuards(props)}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <HugeiconsIcon icon={CheckIcon} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1 text-xs font-medium text-muted-foreground data-inset:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground group-data-[variant=destructive]/dropdown-menu-item:text-destructive",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  const inline = useMediaQuery("(max-width: 767px)")
  const [open, setOpen] = React.useState(false)
  const ctx = React.useMemo(
    () => ({ inline, open, setOpen }),
    [inline, open],
  )

  // Inline (mobile): no Radix Sub flyout — children render in the parent menu,
  // the SubContent expands beneath its trigger.
  if (inline) {
    return (
      <DropdownSubInlineContext.Provider value={ctx}>
        {children}
      </DropdownSubInlineContext.Provider>
    )
  }

  return (
    <DropdownSubInlineContext.Provider value={ctx}>
      <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props}>
        {children}
      </DropdownMenuPrimitive.Sub>
    </DropdownSubInlineContext.Provider>
  )
}

// Rows light up from `data-highlighted` alone, never `:hover`: Radix moves the
// highlight with the pointer AND the keyboard, and ignores the rows crossed on
// the way to a submenu, so a hover style would light a second row.
const SUB_TRIGGER_CLASS =
  `flex min-h-8 max-[1199px]:min-h-10 ${COARSE_ROW} app-desktop:py-1.5! cursor-default items-center gap-1.5 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-inset:pl-8 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  const ctx = React.useContext(DropdownSubInlineContext)

  // Inline (mobile): a regular menu item that toggles the inline expansion
  // without closing the dropdown (onSelect preventDefault).
  if (ctx?.inline) {
    return (
      <DropdownMenuPrimitive.Item
        data-slot="dropdown-menu-sub-trigger"
        data-inset={inset}
        data-open={ctx.open ? "" : undefined}
        onSelect={(event) => {
          event.preventDefault()
          ctx.setOpen(!ctx.open)
        }}
        className={cn(SUB_TRIGGER_CLASS, className)}
        {...(props as React.ComponentProps<typeof DropdownMenuPrimitive.Item>)}
      >
        {children}
        <ChevronRightIcon
          className={cn(
            "ml-auto transition-transform duration-150",
            ctx.open && "rotate-90",
          )}
        />
      </DropdownMenuPrimitive.Item>
    )
  }

  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(SUB_TRIGGER_CLASS, className)}
      {...props}
      {...closingMenuGuards(props)}
    >
      {children}
      <ChevronRightIcon className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  children,
  collisionPadding = OVERLAY_COLLISION_PADDING,
  ref,
  onScroll,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  const ctx = React.useContext(DropdownSubInlineContext)
  const fade = useMenuScrollFade<HTMLDivElement>()
  const mergedRef = useMergedRef(ref, fade.ref)

  // Inline (mobile): render the items in place, indented under the trigger,
  // only while expanded. No portal/flyout — so it can never spill off screen.
  if (ctx?.inline) {
    if (!ctx.open) return null
    return (
      <div
        data-slot="dropdown-menu-sub-content"
        className={cn("ml-2.5 border-l border-border/60 pl-1", className)}
      >
        {children}
      </div>
    )
  }

  return (
    // Portal to <body> so the submenu escapes the parent menu's overflow and
    // its collision boundary becomes the viewport — Radix then keeps it on
    // screen, overlapping the parent menu when there's no room to either side
    // instead of spilling off the edge.
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.SubContent
        data-slot="dropdown-menu-sub-content"
        avoidCollisions
        // `always` drops Radix's limitShift, letting the submenu shift fully
        // into the viewport (overlapping the parent menu) instead of staying
        // pinned to the trigger and spilling off a narrow screen.
        sticky="always"
        collisionPadding={collisionPadding}
        className={cn(
                          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-40 max-w-[calc(100vw-1rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-xl bg-popover scroll-py-10 p-2 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
                          className
                        )}
        ref={mergedRef}
        onScroll={(event) => {
          onScroll?.(event)
          fade.onScroll()
        }}
        {...props}
      >
        {fade.start}
        {children}
        {fade.end}
      </DropdownMenuPrimitive.SubContent>
    </DropdownMenuPrimitive.Portal>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuSearchScope,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
