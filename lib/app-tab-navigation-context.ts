import { createContext, useContext } from "react";
import type { AppTabsSession } from "./app-tabs-session";

/**
 * The session-level navigation scope, split out of `app-tabs-context` so
 * modules beneath it in the dependency graph (current-view-context) can read
 * the active tab without importing the provider — and through it the route
 * sync — back in. The session type is a type-only import, so this module
 * stays cycle-free at runtime.
 *
 * Inside a retained-view scope (`AppTabNavigationScope`) the value carries
 * THAT scope's tab id; at the root it carries the session's active tab.
 */
export interface AppTabNavigationValue {
  session: AppTabsSession;
  activeId: string | null;
}

export const NavigationContext = createContext<AppTabNavigationValue | null>(null);

export function useOptionalAppTabNavigation() {
  return useContext(NavigationContext);
}
