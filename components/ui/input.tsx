import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg bg-control px-3.5 py-1.5 font-sans font-normal text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 app-desktop:h-9 app-desktop:text-sm dark:aria-invalid:ring-destructive/40 user-invalid:ring-3 user-invalid:ring-destructive/20 dark:user-invalid:ring-destructive/40 forced-colors:outline-1 forced-colors:outline-solid forced-colors:-outline-offset-1 forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-solid",
        className
      )}
      {...props}
    />
  )
}

export { Input }
