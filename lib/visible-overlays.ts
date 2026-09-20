/**
 * Retained React Activity trees keep their host/portal DOM with display:none.
 * Only visible overlays own keyboard and dismissal interactions. These checks
 * run on the handful of matching overlays, never on every board card.
 */
export function isVisibleOverlay(element: Element): boolean {
  if (!element.isConnected) return false;
  if (typeof element.checkVisibility === "function") {
    return element.checkVisibility({ visibilityProperty: true });
  }
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
}

export function hasVisibleOverlay(selector: string): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll(selector)).some(isVisibleOverlay);
}

export function hasVisibleOpenDialog(): boolean {
  return hasVisibleOverlay('[role="dialog"][data-state="open"]');
}

/** Search keyboard navigation must stay inside its own portaled action menu. */
export function actionMenuItems(input: Element | null): HTMLElement[] {
  const menu = input?.closest('[data-slot="dropdown-menu-content"]');
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>(
    '[data-slot="dropdown-menu-item"]:not([data-disabled]),[data-slot="dropdown-menu-sub-trigger"]:not([data-disabled])',
  ));
}
