import { MOBILE_LAYOUT_QUERY } from "@/lib/use-mobile-layout";

/** Automatic text focus opens the software keyboard before a sheet settles. */
export function allowInputAutoFocus() {
  return typeof window !== "undefined" && !window.matchMedia?.(MOBILE_LAYOUT_QUERY).matches;
}

/** Move modal focus into the sheet without opening the software keyboard. */
export function focusMobileSheet(event: Event) {
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
}
