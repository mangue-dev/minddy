import { HugeiconsIcon } from "@hugeicons/react"
import { CheckIcon, Copy01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

const HIDDEN = "scale-50 opacity-0 blur-[2px]"
const SWAP = "col-start-1 row-start-1 size-full transition-[opacity,scale,filter] duration-200 ease-out"

/**
 * The icon of a copy button: the copy glyph, and the check that confirms the
 * copy. The two overlap and cross-fade, each one scaling and fading through a
 * slight blur, instead of cutting from one to the other. `className` sizes the
 * pair; the two other class props tint one glyph. Decorative: the button
 * carries the label.
 */
export function CopyStateIcon({
  copied,
  className,
  copyClassName,
  checkClassName,
}: {
  copied: boolean
  className?: string
  copyClassName?: string
  checkClassName?: string
}) {
  return (
    <span
      data-slot="copy-state-icon"
      data-copied={copied ? "" : undefined}
      aria-hidden="true"
      className={cn("inline-grid size-4 shrink-0 place-items-center", className)}
    >
      <HugeiconsIcon icon={Copy01Icon} className={cn(SWAP, copyClassName, copied && HIDDEN)} />
      <HugeiconsIcon
        icon={CheckIcon}
        className={cn(SWAP, checkClassName, !copied && HIDDEN)}
      />
    </span>
  )
}

/**
 * Live confirmation of a copy control, read by screen readers. It sits next
 * to the button, never inside it (a button's children are presentational, so
 * a live region there is not reliably announced), and stays mounted and empty
 * between copies so the message is announced when it appears. Inside a modal
 * dialog it must render inside the dialog content: the dialog hides everything
 * else, the toaster included, from assistive technology. Leave `failedLabel`
 * out where a failure toast is shown, so the failure is not announced twice.
 */
export function CopyStatus({
  state,
  copiedLabel,
  failedLabel,
}: {
  state: "idle" | "copied" | "failed"
  copiedLabel: string
  failedLabel?: string
}) {
  return (
    <span role="status" className="sr-only">
      {state === "copied" ? copiedLabel : state === "failed" ? (failedLabel ?? "") : ""}
    </span>
  )
}
