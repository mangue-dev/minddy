"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useMediaQuery } from "mangue-ui";

/** Persisted choice — survives reloads; the sidebar never reclaims space on
 * its own after a round trip. The preference is read as an external store,
 * not as a state initializer: hydration renders with the server snapshot
 * (docked) so the markup matches, and the stored choice is picked up in
 * React's resynchronization right after — the same trade `useMediaQuery`
 * makes for breakpoints. */
const STORAGE_KEY = "minddy.sidebar-hidden";
/** Same-tab change notice: the `storage` event only reaches other tabs. */
const CHANGE_EVENT = "minddy.sidebar-hidden-change";

const readPreference = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const serverPreference = (): boolean => false;

function subscribe(callback: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // A `null` key means another tab cleared its storage; both reread.
    if (event.key === STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

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
  const preference = useSyncExternalStore(subscribe, readPreference, serverPreference);
  const disabled = compactDesktop;
  const hidden = disabled || preference;
  const toggle = useCallback(() => {
    if (compactDesktop) return;
    const next = !readPreference();
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
    } catch {
      // Storage unavailable (private mode…): the choice holds for the live session.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
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
