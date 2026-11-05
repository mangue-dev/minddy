"use client"

import * as React from "react"

import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface"

/**
 * Height of the band the operating system draws its window controls in, over
 * the web view: the macOS traffic lights (top left) and the integrated Windows
 * and Linux caption buttons (top right, `titleBarOverlay.height` in
 * lib/desktop/window-frame.ts). Floating UI only knows rectangles, so the
 * whole band is kept clear rather than its two corners; it is the window's
 * drag band anyway.
 */
export const WINDOW_CONTROLS_SAFE_AREA = 44

export type OverlayCollisionPadding = {
  top: number
  right: number
  bottom: number
  left: number
}

/** The room a floating surface keeps from each window edge. */
export function overlayCollisionPadding(
  windowControls: boolean,
  edge: number = OVERLAY_COLLISION_PADDING,
): OverlayCollisionPadding {
  return {
    top: windowControls ? WINDOW_CONTROLS_SAFE_AREA + edge : edge,
    right: edge,
    bottom: edge,
    left: edge,
  }
}

/**
 * Whether the OS draws window controls over the page. Set on `<html>` by
 * components/desktop-chrome.tsx: macOS always hides its title bar, Windows
 * and Linux only once the document opted into the integrated caption buttons.
 */
export function windowControlsOverlayPage(root: Element): boolean {
  return (
    root.getAttribute("data-desktop-platform") === "darwin" ||
    root.hasAttribute("data-integrated-caption-controls")
  )
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-desktop-platform", "data-integrated-caption-controls"],
  })
  return () => observer.disconnect()
}

const readWindowControls = () => windowControlsOverlayPage(document.documentElement)
const noWindowControls = () => false

/** Live `windowControlsOverlayPage` of the document; false on the server. */
export function useWindowControlsOverlayPage(): boolean {
  return React.useSyncExternalStore(subscribe, readWindowControls, noWindowControls)
}

/**
 * The default `collisionPadding` of every floating primitive. A surface that
 * wants a wider margin passes its own `edge` instead of a bare number, which
 * would drop the window-controls band.
 */
export function useOverlayCollisionPadding(edge: number = OVERLAY_COLLISION_PADDING): OverlayCollisionPadding {
  const windowControls = useWindowControlsOverlayPage()
  return React.useMemo(() => overlayCollisionPadding(windowControls, edge), [windowControls, edge])
}
