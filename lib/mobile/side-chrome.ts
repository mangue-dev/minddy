/**
 * Which side of the screen the system's controls stand on, if any (MIN-907).
 *
 * iPhone Duo puts the status bar on a side of the screen instead of at its
 * top: on the outer display, and on the inner display in landscape. Apple
 * moves an app's tab bar and toolbars into that column too ("Designing for
 * iPhone Duo"), so the bottom bar stands there as a vertical capsule. On the
 * inner display in portrait the status bar is back at the top, and so is a
 * horizontal bar at the bottom.
 *
 * The device is told apart by its safe areas alone: an inset on one side,
 * none on the other and none at the top. An iPhone in landscape has insets on
 * both sides (the camera's, and its mirror), an iPad and a phone in portrait
 * one at the top.
 */

export type SideChrome = "left" | "right";

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Below this many pixels an inset is a rounded corner, not a column. */
const COLUMN_MIN_WIDTH = 24;

export function sideChromeFor(insets: SafeAreaInsets): SideChrome | null {
  if (insets.top > 0) return null;
  if (insets.right >= COLUMN_MIN_WIDTH && insets.left === 0) return "right";
  if (insets.left >= COLUMN_MIN_WIDTH && insets.right === 0) return "left";
  return null;
}

/**
 * The safe-area insets of `document`'s window, in CSS pixels. Works before
 * the body exists, from the pre-paint script (lib/app-layout-bootstrap.ts).
 */
export function readSafeAreaInsets(document: Document): SafeAreaInsets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  (document.body ?? document.documentElement).appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

/**
 * Sets `data-side-chrome` on the document's root for the screen as it is now
 * (app/globals.css lays the bottom bar out from it). The pre-paint script
 * runs it once, so a browser that knows its safe areas already has the bar
 * on its side in the first frame; the mobile app's shell sets it even earlier
 * (`updateSideChromeScript`, MinddyViewController.swift).
 */
export function applySideChrome(document: Document): void {
  const root = document.documentElement;
  const insets = readSafeAreaInsets(document);
  // No inset at all is a page that does not know its safe areas yet: the
  // mobile app's WebView reports them only after the first paint. The shell
  // sets the side before the page runs; keep it until the insets say more.
  if (insets.top === 0 && insets.right === 0 && insets.bottom === 0 && insets.left === 0) return;
  const side = sideChromeFor(insets);
  if (side) root.setAttribute("data-side-chrome", side);
  else root.removeAttribute("data-side-chrome");
}

/**
 * Keeps `data-side-chrome` in step with the screen until the returned
 * function is called.
 */
export function watchSideChrome(document: Document): () => void {
  const root = document.documentElement;
  const view = document.defaultView;
  const update = () => applySideChrome(document);
  update();
  // The safe areas settle a few frames after the window says it changed:
  // read them again over the rotation's length.
  let timers: number[] = [];
  const changed = () => {
    update();
    timers.forEach((timer) => view?.clearTimeout(timer));
    timers = [100, 300, 600].map((delay) => view?.setTimeout(update, delay) ?? 0);
  };
  // Folding, unfolding and a quarter turn resize the window. A half turn
  // keeps its size but moves the system's column to the other side.
  view?.addEventListener("resize", changed);
  view?.screen.orientation?.addEventListener("change", changed);
  return () => {
    view?.removeEventListener("resize", changed);
    view?.screen.orientation?.removeEventListener("change", changed);
    timers.forEach((timer) => view?.clearTimeout(timer));
    root.removeAttribute("data-side-chrome");
  };
}
