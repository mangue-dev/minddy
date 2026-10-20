import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2 py-1.5 text-xs font-medium leading-tight whitespace-nowrap transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-surface-brand text-brand [a]:hover:bg-surface-brand-hover [button]:hover:bg-surface-brand-hover",
        secondary:
          "bg-control text-foreground [a]:hover:bg-control-hover [button]:hover:bg-control-hover",
        destructive:
          "bg-surface-danger text-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive-surface-hover [button]:hover:bg-destructive-surface-hover",
        outline:
          "bg-control text-foreground [a]:hover:bg-control-hover [a]:hover:text-foreground [button]:hover:bg-control-hover [button]:hover:text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  icon,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean
    /** Optional leading icon. Omit it for the icon-less badge. */
    icon?: React.ReactNode
  }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-icon={!asChild && icon ? "inline-start" : undefined}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Badge, badgeVariants }
