"use client";

import { useCallback, useContext, useSyncExternalStore } from "react";
import { normalizeAppTabLocation } from "./app-tab-location";
import { RoutePrefetchAdmissionContext } from "./route-prefetch-admission-context";

/** Only omitted/undefined automatic prefetch belongs to this app policy. */
export function isDefaultInternalRoutePrefetch(href: unknown, prefetch: unknown): boolean {
  return prefetch === undefined && typeof href === "string" && normalizeAppTabLocation(href) !== null;
}

/** First render is closed for this exact app lifetime, including hydration. */
export function useDeferredRoutePrefetch(eligibleElement: boolean, href: unknown, prefetch: unknown): boolean {
  const admission = useContext(RoutePrefetchAdmissionContext);
  const eligible = eligibleElement && isDefaultInternalRoutePrefetch(href, prefetch);
  const subscribe = useCallback((notify: () => void) => admission && eligible ? admission.subscribe(notify) : () => {}, [admission, eligible]);
  const snapshot = useCallback(() => !!admission && eligible && admission.getSnapshot(), [admission, eligible]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
