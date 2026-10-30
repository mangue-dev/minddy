"use client"

import * as React from "react"

/**
 * A closing overlay keeps showing what it showed open.
 *
 * Radix keeps a closed surface mounted for its exit animation, but its caller
 * usually resets right away what the surface displays: a search query cleared
 * in `onOpenChange(false)`, a selected row set back to `null`, a step counter
 * rewound. The surface then plays its exit on a different, often emptier and
 * smaller, content — the jump the eye catches before the fade ends.
 *
 * The root records whether it is open (`useOverlayOpen`), and the content
 * renders the children of its last open render while it closes
 * (`useFrozenWhileClosed`). React reuses those very elements, so the subtree
 * skips the caller's resets until the surface opens again with fresh children.
 */
type OverlayState = { open: boolean; onOpenChange: (open: boolean) => void }
const OverlayOpenContext = React.createContext<OverlayState | null>(null)

type OpenProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

/** Mirrors a Radix root's open state, controlled or not, without changing it. */
function useOverlayOpen({ open, defaultOpen, onOpenChange }: OpenProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false)
  const controlled = open !== undefined
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange]
  )
  return { open: controlled ? open : uncontrolled, onOpenChange: handleOpenChange }
}

/** Wraps a Radix root: publishes its open state and the way to close it. */
function OverlayOpenProvider({
  open,
  onOpenChange,
  children,
}: OverlayState & { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ open, onOpenChange }), [open, onOpenChange])
  return <OverlayOpenContext.Provider value={value}>{children}</OverlayOpenContext.Provider>
}

/** The nearest tracked root's state, for a content that acts on it. */
function useOverlayState(): OverlayState | null {
  return React.useContext(OverlayOpenContext)
}

/** The children to render: the live ones while open, the last open ones while
 * the surface closes. Outside a tracked root it passes them through. */
function useFrozenWhileClosed(children: React.ReactNode): React.ReactNode {
  const open = React.useContext(OverlayOpenContext)?.open ?? null
  const lastOpen = React.useRef(children)
  // Written during render on purpose: the frozen children must be the ones of
  // the very render that was last open, not of a later effect.
  if (open !== false) lastOpen.current = children
  return open === false ? lastOpen.current : children
}

/** How long a lazily mounted overlay stays mounted once closed: past the
 * longest exit animation of the primitives (the sheet's 180 ms). */
const EXIT_LINGER_MS = 300

/**
 * For callers that mount an overlay only while it is open (rich boards keep
 * hundreds of closed pickers out of the tree): true while open, and for the
 * exit animation after. Unmounting on close skipped that animation entirely.
 */
function useMountedWhileClosing(open: boolean): boolean {
  const [lingering, setLingering] = React.useState(open)
  // Set during render, so the open frame already has the overlay mounted.
  if (open && !lingering) setLingering(true)
  React.useEffect(() => {
    if (open || !lingering) return
    const timer = window.setTimeout(() => setLingering(false), EXIT_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [open, lingering])
  return open || lingering
}

/** A key that changes when a pointer-anchored menu opens at another point.
 * Radix positions a popper once against its anchor; a menu already showing
 * (or still fading out) that is re-opened by a right click elsewhere would
 * stay where the first click put it. A new key mounts it at the new point. */
function anchorKey(point: { x: number; y: number } | null | undefined): string {
  return point ? `${point.x},${point.y}` : "none"
}

/**
 * For a dialog its caller mounts per edit and unmounts in `onClose`: the
 * dialog closes itself first, and hands `onClose` to the caller once its exit
 * animation has played. Returns the dialog's `open` and the close to call
 * in place of the caller's.
 */
function useOpenUntilClosed(onClosed: () => void): [boolean, () => void] {
  const [open, setOpen] = React.useState(true)
  const latest = React.useRef(onClosed)
  React.useEffect(() => {
    latest.current = onClosed
  }, [onClosed])
  React.useEffect(() => {
    if (open) return
    const timer = window.setTimeout(() => latest.current(), EXIT_LINGER_MS)
    return () => window.clearTimeout(timer)
  }, [open])
  const close = React.useCallback(() => setOpen(false), [])
  return [open, close]
}

export {
  OverlayOpenProvider,
  anchorKey,
  useFrozenWhileClosed,
  useMountedWhileClosing,
  useOpenUntilClosed,
  useOverlayOpen,
  useOverlayState,
}
