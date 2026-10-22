"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "./button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu"

type SplitButtonVariant = "default" | "outline" | "destructive"
type SplitButtonSize = "sm" | "default" | "lg"

/** The chevron trigger is a compact icon-button matching the action's height. */
const TRIGGER_SIZE: Record<SplitButtonSize, "icon-sm" | "icon" | "icon-lg"> = {
  sm: "icon-sm",
  default: "icon",
  lg: "icon-lg",
}

const TRIGGER_WIDTH: Record<SplitButtonSize, "w-8" | "w-9" | "w-10"> = {
  sm: "w-8",
  default: "w-9",
  lg: "w-10",
}

export interface SplitButtonProps
  extends Omit<
    React.ComponentProps<typeof Button>,
    "size" | "variant" | "asChild"
  > {
  variant?: SplitButtonVariant
  size?: SplitButtonSize
  /** Dropdown items, rendered inside the menu's `DropdownMenuContent`. */
  menu: React.ReactNode
  /** Accessible label for the chevron trigger. */
  menuLabel?: string
  /** Alignment of the dropdown relative to the trigger (default "end"). */
  menuAlign?: "start" | "center" | "end"
  /** Extra props forwarded to `DropdownMenuContent`. */
  menuContentProps?: React.ComponentProps<typeof DropdownMenuContent>
  /** Disables the chevron alone; defaults to `disabled`. Lets the menu offer
      an item the primary action cannot run yet. */
  menuDisabled?: boolean
  /** Controlled open state for the dropdown. */
  menuOpen?: boolean
  onMenuOpenChange?: (open: boolean) => void
  /** className for the outer wrapper. */
  className?: string
  /** className for the primary action button. */
  actionClassName?: string
  /** className for the chevron trigger button. */
  triggerClassName?: string
}

/**
 * A split button: a primary action paired with a dropdown. Clicking the left
 * side runs the action; the right chevron opens `menu`. Both halves share the
 * same `variant`/`size` and are separated by a small gap.
 *
 *   <SplitButton onClick={run} menu={<><DropdownMenuItem>…</DropdownMenuItem></>}>
 *     <Play /> Run
 *   </SplitButton>
 */
export function SplitButton({
  variant = "default",
  size = "default",
  menu,
  menuLabel = "More options",
  menuAlign = "end",
  menuContentProps,
  menuOpen,
  onMenuOpenChange,
  className,
  actionClassName,
  triggerClassName,
  disabled,
  menuDisabled = disabled,
  children,
  ...actionProps
}: SplitButtonProps) {
  const resolvedVariant: SplitButtonVariant =
    variant === "outline" || variant === "destructive" ? variant : "default"

  return (
    <div
      data-slot="split-button"
      className={cn("inline-flex gap-px rounded-full", className)}
    >
      <Button
        variant={resolvedVariant}
        size={size}
        disabled={disabled}
        className={cn(
          actionClassName,
          "rounded-none rounded-l-full rounded-r-none"
        )}
        {...actionProps}
      >
        {children}
      </Button>
      <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={resolvedVariant}
            size={TRIGGER_SIZE[size]}
            disabled={menuDisabled}
            aria-label={menuLabel}
            className={cn(
              triggerClassName,
              TRIGGER_WIDTH[size],
              "px-0! rounded-none rounded-l-none rounded-r-full"
            )}
          >
            <ChevronDown className="-translate-x-px" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={menuAlign} {...menuContentProps}>
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
