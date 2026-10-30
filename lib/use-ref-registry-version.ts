"use client";

import { useSyncExternalStore } from "react";
import { refRegistryVersion, subscribeRefRegistry } from "./ref-registry";

/** Re-render when newly loaded data makes more short codes resolvable. */
export function useRefRegistryVersion(): number {
  return useSyncExternalStore(subscribeRefRegistry, refRegistryVersion, () => 0);
}
