"use client";

import { createContext } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { navigationPreparationPending, subscribeNavigationPreparation } from "./navigation-preparation-priority";

/** Observe one provider lifetime without acquiring another preparation owner. */
export function createRoutePrefetchAdmission(client: QueryClient) {
  let observed = false;
  const listeners = new Set<() => void>();
  return {
    observeLifecycle() {
      if (observed) return;
      observed = true;
      for (const notify of Array.from(listeners)) notify();
    },
    getSnapshot: () => !observed || navigationPreparationPending(client),
    subscribe(notify: () => void) {
      listeners.add(notify);
      const stop = subscribeNavigationPreparation(client, notify);
      return () => { listeners.delete(notify); stop(); };
    },
  };
}

export type RoutePrefetchAdmission = ReturnType<typeof createRoutePrefetchAdmission>;
/** Outside the app provider, Next retains its ordinary default behavior. */
export const RoutePrefetchAdmissionContext = createContext<RoutePrefetchAdmission | null>(null);
