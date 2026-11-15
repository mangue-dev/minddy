import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none rounded-lg bg-control px-3.5 py-2 font-sans font-normal text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 app-desktop:text-sm dark:aria-invalid:ring-destructive/40 user-invalid:ring-3 user-invalid:ring-destructive/20 dark:user-invalid:ring-destructive/40 forced-colors:outline-1 forced-colors:outline-solid forced-colors:-outline-offset-1 forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-solid",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
