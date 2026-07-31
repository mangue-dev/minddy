"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { trackEvent } from "./analytics";

/** D'où vient l'ouverture — la dimension de `scratchpad_opened`. Chaque appelant
    la nomme : le bouton du header, la palette, le chord `G N`. */
type ScratchpadSource = "click" | "palette" | "shortcut" | "sidebar" | "home";

/** Open state of the personal Notes modal, lifted so the header button, the
    command palette and the `G N` keyboard chord can all open it. */
interface ScratchpadContextValue {
  isOpen: boolean;
  /** `source` part dans l'analytics — ne PAS brancher directement sur un
      `onClick`, qui passerait l'événement React à sa place. */
  open: (source?: ScratchpadSource) => void;
  close: () => void;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const ScratchpadContext = createContext<ScratchpadContextValue | null>(null);

export function ScratchpadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback((source: ScratchpadSource = "click") => {
    trackEvent("scratchpad_opened", { source });
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo<ScratchpadContextValue>(
    () => ({ isOpen, open, close, setOpen: setIsOpen }),
    [isOpen, open, close]
  );
  return (
    <ScratchpadContext.Provider value={value}>
      {children}
    </ScratchpadContext.Provider>
  );
}

export function useScratchpad(): ScratchpadContextValue {
  const ctx = useContext(ScratchpadContext);
  if (!ctx) {
    throw new Error("useScratchpad must be used within a ScratchpadProvider");
  }
  return ctx;
}
