"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useMediaQuery } from "mangue-ui";

interface SidebarVisibilityContextValue {
  hidden: boolean;
  toggle: () => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibilityContextValue | null>(null);

export function SidebarVisibilityProvider({ children }: { children: ReactNode }) {
  const compactDesktop = useMediaQuery("(min-width: 768px) and (max-width: 1199px)");
  // Follow the responsive default until the user explicitly chooses a state.
  // Keep that choice across navigation and resizing, and reset it on reload.
  const [preference, setPreference] = useState<boolean | null>(null);
  const hidden = preference ?? compactDesktop;
  const toggle = useCallback(() => {
    setPreference((current) => !(current ?? compactDesktop));
  }, [compactDesktop]);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);

  return (
    <SidebarVisibilityContext.Provider value={value}>
      {children}
    </SidebarVisibilityContext.Provider>
  );
}

export function useSidebarVisibility(): SidebarVisibilityContextValue {
  const context = useContext(SidebarVisibilityContext);
  if (!context) {
    throw new Error("useSidebarVisibility must be used within a SidebarVisibilityProvider");
  }
  return context;
}
