import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { SelfLabelTooltip } from "./app-tooltip"
import { COARSE_BUTTON_HIT_AREA, COARSE_BUTTON_INSET_HIT_AREA, COARSE_BUTTON_PRESS, COARSE_BUTTON_TOUCH_ACTION } from "./touch-target"

const buttonVariants = cva(
  `${COARSE_BUTTON_TOUCH_ACTION} ${COARSE_BUTTON_HIT_AREA} ${COARSE_BUTTON_PRESS} group/button inline-flex shrink-0 items-center justify-center rounded-full in-data-[slot=button-group]:rounded-lg bg-clip-padding text-sm font-medium leading-none whitespace-nowrap transition-all outline-none select-none focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:bg-control! disabled:text-muted-foreground! disabled:ring-0 aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover aria-expanded:bg-primary-hover",
        outline:
          "bg-control hover:bg-control-hover hover:text-foreground aria-expanded:bg-control-hover aria-expanded:text-foreground",
        ghost:
          "bg-background text-foreground hover:bg-control-hover aria-expanded:bg-control-hover",
        destructive:
          "bg-destructive-button text-destructive-button-foreground hover:brightness-90 aria-expanded:brightness-90",
        link:
          `bg-background text-primary underline-offset-4 hover:bg-control-hover hover:text-primary-hover hover:underline aria-expanded:bg-control-hover aria-expanded:text-primary-hover aria-expanded:underline ${COARSE_BUTTON_INSET_HIT_AREA}`,
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 py-2.5 has-data-[icon=inline-end]:pl-3 has-data-[icon=inline-start]:pl-3 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pr-3.5",
        sm: "h-8 gap-1 px-2.5 py-2 text-[0.8rem] has-data-[icon=inline-end]:pl-2.5 has-data-[icon=inline-start]:pl-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pr-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-1.5 px-3.5 py-3 has-data-[icon=inline-end]:pl-3.5 has-data-[icon=inline-start]:pl-3.5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pr-4",
        icon: "size-9 p-0",
        "icon-sm": "size-8 p-0",
        "icon-lg": "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const ICON_SIZES = new Set(["icon", "icon-sm", "icon-lg"])

/**
 * An icon-only button labels itself (MIN-724): with an icon size, its
 * `aria-label` doubles as its tooltip, so the action is named on hover and
 * focus without each caller wrapping it. `tooltip` replaces that text (or,
 * `false`, opts out where the surrounding UI already names the action);
 * `shortcut` adds the keys of the equivalent keyboard shortcut.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  tooltip,
  shortcut,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    tooltip?: React.ReactNode | false
    shortcut?: readonly string[]
  }) {
  const Comp = asChild ? Slot.Root : "button"

  const button = (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
  const label =
    tooltip === false
      ? null
      : (tooltip ?? (ICON_SIZES.has(size ?? "") ? props["aria-label"] : null))
  if (label === null || label === undefined || label === "") return button
  return (
    <SelfLabelTooltip label={label} shortcut={shortcut}>
      {button}
    </SelfLabelTooltip>
  )
}

export { Button, buttonVariants }
