import { isVisibleOverlay } from "@/lib/visible-overlays";

const ITEM_SELECTOR = "[data-sidebar-navigation-item], [data-sidebar-filter-result]";
const UNAVAILABLE_SELECTOR =
  '[hidden], [inert], [aria-hidden="true"], [disabled], [aria-disabled="true"], .sidebar-nav-panel[data-open="false"]';

/** Activate only options in the currently displayed sidebar, in rendered order. */
export function activateSidebarOption(
  direction: -1 | 1,
  root: ParentNode = document,
): boolean {
  const items = Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR)).filter((item) =>
    item.closest("[data-sidebar-navigation]") &&
    !item.closest(UNAVAILABLE_SELECTOR) && isVisibleOverlay(item),
  );
  if (!items.length) return false;
  const focused = document.activeElement?.closest(ITEM_SELECTOR);
  let current = items.findIndex((item) => item === focused);
  if (current < 0) {
    current = items.findIndex((item) =>
      item.matches('[aria-current="page"], [aria-current="true"], [aria-selected="true"]'),
    );
  }
  const index = current < 0 ? (direction === 1 ? 0 : items.length - 1) :
    (current + direction + items.length) % items.length;
  const next = items[index];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: "nearest" });
  // A plain click follows the same route/selection logic as pointer navigation.
  next.click();
  return true;
}
