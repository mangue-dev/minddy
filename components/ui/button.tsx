import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { SelfLabelTooltip } from "./app-tooltip"
import { COARSE_BUTTON_HIT_AREA, COARSE_BUTTON_INSET_HIT_AREA, COARSE_BUTTON_PRESS, COARSE_BUTTON_TOUCH_ACTION } from "./touch-target"

/**
 * On a phone a button is aimed with a thumb and read at arm's length. The
 * desktop's 32 to 40px buttons with 14 and 16px icons take one set of sizes
 * there: a text button is 44px tall with an 18px icon, an icon button 40px
 * with a 20px icon (its touch area is already 44px). `min-*`, so a caller
 * that asks for more keeps it; a link stays a line of text.
 */
const PHONE_TEXT_BUTTON =
  "app-mobile:not-data-[variant=link]:min-h-11 app-mobile:not-data-[variant=link]:px-4 app-mobile:[&>svg]:min-h-[18px] app-mobile:[&>svg]:min-w-[18px]";
const PHONE_ICON_BUTTON =
  "app-mobile:min-h-10 app-mobile:min-w-10 app-mobile:[&>svg]:min-h-5 app-mobile:[&>svg]:min-w-5";

const buttonVariants = cva(
  `${COARSE_BUTTON_TOUCH_ACTION} ${COARSE_BUTTON_HIT_AREA} ${COARSE_BUTTON_PRESS} group/button inline-flex shrink-0 items-center justify-center rounded-full in-data-[slot=button-group]:rounded-lg bg-clip-padding text-sm font-medium leading-tight whitespace-nowrap transition-all outline-none select-none [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:text-muted-foreground! disabled:ring-0 aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        // Disabled, the main action keeps its accent, faded: it stays the main
        // action, only not yet available. A press darkens every variant, the
        // only answer a finger gets where there is no hover.
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover data-pressed:bg-primary-hover aria-expanded:bg-primary-hover disabled:bg-primary/40! disabled:text-primary-foreground!",
        outline:
          "bg-control hover:bg-control-hover active:bg-control-hover data-pressed:bg-control-hover hover:text-foreground aria-expanded:bg-control-hover aria-expanded:text-foreground disabled:bg-control!",
        // A disabled ghost or link keeps its surface: only its text and icon mute.
        ghost:
          "bg-background text-foreground hover:bg-control-hover active:bg-control-hover data-pressed:bg-control-hover aria-expanded:bg-control-hover",
        destructive:
          "bg-destructive-button text-destructive-button-foreground hover:brightness-90 active:brightness-90 data-pressed:brightness-90 aria-expanded:brightness-90 disabled:bg-control!",
        link:
          `bg-background text-primary underline-offset-4 hover:bg-control-hover hover:text-primary-hover hover:underline aria-expanded:bg-control-hover aria-expanded:text-primary-hover aria-expanded:underline ${COARSE_BUTTON_INSET_HIT_AREA}`,
      },
      size: {
        default:
          `${PHONE_TEXT_BUTTON} h-9 gap-1.5 px-3 py-2.5 has-data-[icon=inline-end]:pl-3 has-data-[icon=inline-start]:pl-3 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pr-3.5`,
        sm: `${PHONE_TEXT_BUTTON} h-8 gap-1 px-2.5 py-2 text-[0.8rem] has-data-[icon=inline-end]:pl-2.5 has-data-[icon=inline-start]:pl-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pr-3 [&_svg:not([class*='size-'])]:size-3.5`,
        lg: `${PHONE_TEXT_BUTTON} h-10 gap-1.5 px-3.5 py-3 has-data-[icon=inline-end]:pl-3.5 has-data-[icon=inline-start]:pl-3.5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pr-4`,
        icon: `${PHONE_ICON_BUTTON} size-9 p-0`,
        "icon-sm": `${PHONE_ICON_BUTTON} size-8 p-0`,
        "icon-lg": `${PHONE_ICON_BUTTON} size-10 p-0`,
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
