import type { AppTabsSnapshot } from "./app-tabs-session";

/** A late forge confirmation may consume only the location that initiated it. */
export function canConsumePrDeepLink(
  expectedHref: string,
  tabId: string | null,
  current: Pick<AppTabsSnapshot, "activeId" | "tabs"> | undefined,
  windowHref: string,
): boolean {
  if (!current) return windowHref === expectedHref;
  return current.activeId === tabId &&
    current.tabs.find((tab) => tab.id === tabId)?.href === expectedHref;
}
