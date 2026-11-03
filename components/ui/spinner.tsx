"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { LoaderCircleIcon } from "@hugeicons/core-free-icons"

/** A loading glyph that names itself in the reader's language; callers override `aria-label`. */
function Spinner({ className, strokeWidth = 1.5, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("Common")
  return (
    <HugeiconsIcon icon={LoaderCircleIcon} strokeWidth={Number(strokeWidth)} role="status" aria-label={t("loading")} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
