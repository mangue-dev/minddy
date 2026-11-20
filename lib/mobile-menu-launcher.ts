"use client";

export const OPEN_MOBILE_PAGE_LIST_EVENT = "minddy:open-mobile-page-list";

/**
 * Opens the phone's navigation sheet on the current page's own list, the tab
 * it opens on by itself when the page has one (components/mobile-navigation.tsx).
 * A screen that waits for a pick, such as the empty pages screen, uses it.
 */
export function openMobilePageList() {
  window.dispatchEvent(new Event(OPEN_MOBILE_PAGE_LIST_EVENT));
}
