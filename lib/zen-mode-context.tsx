"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { formatModShortcut } from "@/lib/keyboard/shortcuts";

/**
 * Zen mode (MIN-134): the board alone, without sidebar, without header, without the
 * FAB of Numo. It toggles FROM THE PALETTE only — giving it a button
 * would add an interface element to the one it claims to clean.
 *
 * The state lives in memory, and nowhere else. It's the safety net:
 * who activated it inadvertently and no longer knows how to get out, reloads the page
 * — the universal reflex — and finds its interface. Placing it in sessionStorage
 * would survive the reload and close this exit door; localStorage,
 * worse, would condemn it for all future sessions.
 *
 * The activation toast therefore says the two outputs: ⌘K, and the reload.
 * On output, no toast: the header and the sidebar which return say it
 * already, better than a sentence.
 */
interface ZenModeContextValue {
  /** Hidden Chrome (sidebar, header, FAB). */
  zen: boolean;
  toggle: () => void;
}

const ZenModeContext = createContext<ZenModeContextValue | null>(null);

export function ZenModeProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("Nav");
  const [zen, setZen] = useState(false);

  // The toast is triggered BEFORE the setState, not inside: an updater must remain
  // pure — React replays it (StrictMode in dev, and nothing guarantees a single call
  // in general), and the toast would then be made twice.
  const toggle = useCallback(() => {
    // The shortcut is read on the switch, never when rendered: we are already in the
    // browser, so `navigator` says the real platform (⌘K or Ctrl+K).
    if (!zen) toast.success(t("zenModeOn", { shortcut: formatModShortcut("K") }));
    setZen((on) => !on);
  }, [zen, t]);

  const value = useMemo<ZenModeContextValue>(() => ({ zen, toggle }), [zen, toggle]);

  return <ZenModeContext.Provider value={value}>{children}</ZenModeContext.Provider>;
}

export function useZenMode(): ZenModeContextValue {
  const ctx = useContext(ZenModeContext);
  if (!ctx) {
    throw new Error("useZenMode must be used within a ZenModeProvider");
  }
  return ctx;
}
