import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { LoaderCircleIcon } from "@hugeicons/core-free-icons"

function Spinner({ className, strokeWidth = 1.5, ...props }: React.ComponentProps<"svg">) {
  return (
    <HugeiconsIcon icon={LoaderCircleIcon} strokeWidth={Number(strokeWidth)} role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
