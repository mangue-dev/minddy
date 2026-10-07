"use client";

import { createContext, useContext } from "react";

export interface MobileNavigation {
  registerDeparture: (guard: () => Promise<boolean>) => () => void;
  open: (navigate: () => void) => void;
}
export const MobileNavigationContext = createContext<MobileNavigation | null>(null);
export const useMobileNavigation = () => useContext(MobileNavigationContext);
