import { isMobileLayout } from "@/lib/app-layout";

/** Automatic text focus opens the software keyboard before a sheet settles. */
export function allowInputAutoFocus() {
  return typeof window !== "undefined" && !isMobileLayout();
}

/** Move modal focus into the sheet without opening the software keyboard. */
export function focusMobileSheet(event: Event) {
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
}
