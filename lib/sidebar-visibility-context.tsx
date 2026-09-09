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
  disabled: boolean;
  hidden: boolean;
  toggle: () => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibilityContextValue | null>(null);

export function SidebarVisibilityProvider({ children }: { children: ReactNode }) {
  const compactDesktop = useMediaQuery("(min-width: 768px) and (max-width: 1199px)");
  // Compact desktop layouts always hide navigation. Wider layouts follow the
  // user's explicit choice, if any, and reset that choice on reload.
  const [preference, setPreference] = useState<boolean | null>(null);
  const disabled = compactDesktop;
  const hidden = disabled || preference === true;
  const toggle = useCallback(() => {
    if (compactDesktop) return;
    setPreference((current) => !(current ?? false));
  }, [compactDesktop]);
  const value = useMemo(
    () => ({ disabled, hidden, toggle }),
    [disabled, hidden, toggle],
  );

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
