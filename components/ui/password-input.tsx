"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { HugeiconsIcon } from "@hugeicons/react"
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./input-group"

/**
 * A password field with an eye button that reveals what was typed (MIN-808).
 * `className` styles the visible box, like it would on `Input`; the button
 * keeps the caret where it was and does not steal focus from the field.
 */
function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const t = useTranslations("Common")
  const [visible, setVisible] = React.useState(false)
  const label = visible ? t("hidePassword") : t("showPassword")

  return (
    <InputGroup className={className}>
      <InputGroupInput type={visible ? "text" : "password"} className="h-full" {...props} />
      {/* A square button 2 px inside the field's edges: the eye sits as far
          from the right edge as from the top and bottom, at any field height. */}
      <InputGroupAddon align="inline-end" className="self-stretch py-0.5 pr-0.5 has-[>button]:mr-0">
        <InputGroupButton
          size="icon-sm"
          className="aspect-square h-full w-auto rounded-[calc(var(--radius)-3px)]"
          aria-label={label}
          aria-controls={props.id}
          tooltip={label}
          // Keep focus (and the caret) in the field while toggling.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
        >
          <HugeiconsIcon icon={visible ? ViewOffIcon : ViewIcon} className="size-4" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export { PasswordInput }
