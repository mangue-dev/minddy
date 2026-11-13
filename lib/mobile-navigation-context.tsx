"use client";

import { createContext, useContext } from "react";

export interface MobileNavigation {
  registerDeparture: (guard: () => Promise<boolean>) => () => void;
  /** `href`: the destination, shown ahead of the router's commit once the
      departure guards pass (see lib/pending-navigation.ts). */
  open: (navigate: () => void, href?: string) => void;
}
export const MobileNavigationContext = createContext<MobileNavigation | null>(null);
export const useMobileNavigation = () => useContext(MobileNavigationContext);
