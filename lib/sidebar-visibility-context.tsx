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

/** Persisted choice — survives reloads; the sidebar never reclaims space on
 * its own after a round trip. Read synchronously in the first render so no
 * frame ever paints the opposite state. Server render always sees "docked",
 * so the hidden value applies from hydration onward. */
const STORAGE_KEY = "minddy.sidebar-hidden";

const readPreference = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

interface SidebarVisibilityContextValue {
  disabled: boolean;
  hidden: boolean;
  toggle: () => void;
}

const SidebarVisibilityContext = createContext<SidebarVisibilityContextValue | null>(null);

export function SidebarVisibilityProvider({ children }: { children: ReactNode }) {
  const compactDesktop = useMediaQuery("(min-width: 768px) and (max-width: 1199px)");
  // Compact desktop layouts always hide navigation. Wider layouts follow the
  // user's explicit choice, persisted locally so it survives reloads and never
  // moves by itself.
  const [preference, setPreference] = useState<boolean | null>(readPreference);
  const disabled = compactDesktop;
  const hidden = disabled || preference === true;
  const toggle = useCallback(() => {
    if (compactDesktop) return;
    setPreference((current) => {
      const next = !(current ?? false);
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        // Storage unavailable (private mode…): the choice holds for the live session.
      }
      return next;
    });
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
