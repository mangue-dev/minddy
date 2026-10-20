"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { XIcon } from "lucide-react"

import { Button } from "./button"

/**
 * The default close cross of the dialog, sheet and side-panel primitives. It
 * carries the localized "Close" as its accessible name, which an icon-sized
 * `Button` also shows as its tooltip, with Escape, the key that closes these
 * surfaces (MIN-724). A dialog that focuses it on open does not pop that
 * tooltip: only a focus-moving key opens one on focus (lib/tooltip-focus.ts).
 */
export function CloseButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const t = useTranslations("Common")
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("close")}
      shortcut={["Esc"]}
      className={className}
      {...props}
    >
      <XIcon />
    </Button>
  )
}
