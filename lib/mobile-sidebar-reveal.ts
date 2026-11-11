/** Stay close to the desktop column, using nearly all of a narrow phone. */
export function mobileSidebarWidth(viewport: number, desktopWidth = 320): number {
  return Math.max(0, Math.min(viewport - 24, Math.max(desktopWidth, Math.min(viewport * 0.9, desktopWidth + 40))));
}

/** Horizontal intent wins only after a deliberate movement beyond tap jitter. */
export function sidebarGestureIntent(dx: number, dy: number): "pending" | "horizontal" | "vertical" {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return "pending";
  return Math.abs(dx) > Math.abs(dy) * 1.25 ? "horizontal" : "vertical";
}

export function sidebarGestureSettlesOpen(offset: number, width: number, velocity: number): boolean {
  if (Math.abs(velocity) > 0.45) return velocity > 0;
  return offset >= width * 0.5;
}

/**
 * The page set aside for the sidebar has rounded corners on its left edge, of
 * one fixed radius for the whole gesture: the device's own
 * (`--mobile-page-radius`, app/globals.css). A radius growing with the slide
 * read as the page changing shape under the finger.
 */
export function sidebarPageIsRounded(offset: number, width: number): boolean {
  return width > 0 && offset > 0;
}

/** Editors, native horizontal scrollers and app-owned gestures retain their input. */
export function sidebarGestureIsReserved(target: Element, surface: HTMLElement): boolean {
  if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-mobile-gesture-lock], [data-board-column-scroller], [aria-roledescription="carousel"], [data-carousel], [role="slider"], [draggable="true"]')) return true;
  for (let node: Element | null = target; node && node !== surface; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (node.scrollWidth > node.clientWidth + 1 && /^(auto|scroll)$/.test(style.overflowX)) return true;
  }
  return false;
}
