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

/** Curvature follows the exposed sidebar fraction, including interrupted drags. */
export function sidebarRevealRadius(offset: number, width: number): number {
  return width > 0 ? Math.max(0, Math.min(1, offset / width)) * 24 : 0;
}
