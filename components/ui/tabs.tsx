"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-3 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list relative isolate inline-flex w-fit items-center justify-center gap-1 text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-control p-1 group-data-horizontal/tabs:h-11 group-data-vertical/tabs:rounded-xl",
        line: "bg-transparent group-data-horizontal/tabs:h-10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const tabsIndicatorVariants = cva(
  "pointer-events-none absolute top-0 left-0 -z-10 will-change-transform motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default:
          "rounded-full bg-background shadow-sm group-data-vertical/tabs:rounded-lg",
        line: "after:absolute after:rounded-full after:bg-foreground group-data-horizontal/tabs:after:inset-x-2 group-data-horizontal/tabs:after:-bottom-1 group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-1.5 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ACTIVE_TRIGGER_SELECTOR =
  '[data-slot="tabs-trigger"][data-state="active"], [data-slot="tabs-trigger"][data-active]'

type IndicatorRect = { left: number; top: number; width: number; height: number }

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const measuredOnce = React.useRef(false)
  const [rect, setRect] = React.useState<IndicatorRect | null>(null)
  const [animated, setAnimated] = React.useState(false)

  React.useEffect(() => {
    const list = listRef.current
    if (!list) return

    let frame = 0

    const measure = () => {
      const active = list.querySelector<HTMLElement>(ACTIVE_TRIGGER_SELECTOR)
      if (!active) {
        setRect(null)
        return
      }
      setRect({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      })
      // Let the first position land without a transition, so the indicator
      // fades in where it belongs instead of flying in from the corner.
      if (!measuredOnce.current) {
        measuredOnce.current = true
        requestAnimationFrame(() => setAnimated(true))
      }
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }

    schedule()

    const mutations = new MutationObserver(schedule)
    mutations.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "data-active", "dir"],
    })

    const resizes = new ResizeObserver(schedule)
    resizes.observe(list)
    for (const trigger of list.querySelectorAll('[data-slot="tabs-trigger"]')) {
      resizes.observe(trigger)
    }

    return () => {
      cancelAnimationFrame(frame)
      mutations.disconnect()
      resizes.disconnect()
    }
  }, [])

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      <span
        aria-hidden="true"
        data-slot="tabs-indicator"
        className={cn(
          tabsIndicatorVariants({ variant }),
          rect ? "opacity-100" : "opacity-0",
          animated
            ? "transition-[transform,width,height,opacity] duration-200 ease-out"
            : "transition-[opacity] duration-150 ease-out"
        )}
        style={{
          transform: `translate3d(${rect?.left ?? 0}px, ${rect?.top ?? 0}px, 0)`,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        }}
      />
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full bg-clip-padding px-4 text-sm font-medium leading-none whitespace-nowrap text-foreground/60 transition-all outline-none select-none group-data-horizontal/tabs:h-full group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:rounded-lg group-data-vertical/tabs:py-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent pointer-coarse:touch-manipulation pointer-coarse:before:absolute pointer-coarse:before:inset-y-1/2 pointer-coarse:before:inset-x-0 pointer-coarse:before:-my-[22px] disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "data-active:text-foreground dark:data-active:text-foreground",
        "group-data-[variant=default]/tabs-list:not-data-active:hover:bg-tabs-hover",
        "group-data-[variant=line]/tabs-list:rounded-lg group-data-[variant=line]/tabs-list:not-data-active:hover:bg-tabs-hover",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
