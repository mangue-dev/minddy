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

/** Where the opening comes from — the dimension of `scratchpad_opened`. Each caller
 names it: the header button, the palette, or the global shortcut. */
type ScratchpadSource = "click" | "palette" | "shortcut" | "sidebar" | "home" | "mention";

/** Open state of the personal Notes modal, lifted so the header button, the
    command palette and the Mod+Shift+K keyboard shortcut can all open it. */
interface ScratchpadContextValue {
  isOpen: boolean;
  /** `source` goes into analytics — do NOT plug directly into a
 `onClick`, which would pass the React event in its place. `taskIndex` opens
 the notebook on that task (a palette search hit, MIN-725). */
  open: (source?: ScratchpadSource, target?: { taskIndex: number }) => void;
  close: () => void;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** The task the notebook should land on once its editor is ready, or null. */
  focusTaskIndex: number | null;
  /** Called by the editor once it has landed on `focusTaskIndex`. */
  clearFocusTask: () => void;
}

const ScratchpadContext = createContext<ScratchpadContextValue | null>(null);

export function ScratchpadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusTaskIndex, setFocusTaskIndex] = useState<number | null>(null);
  const open = useCallback((source: ScratchpadSource = "click", target?: { taskIndex: number }) => {
    trackEvent("scratchpad_opened", { source });
    setFocusTaskIndex(target?.taskIndex ?? null);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const clearFocusTask = useCallback(() => setFocusTaskIndex(null), []);
  const value = useMemo<ScratchpadContextValue>(
    () => ({ isOpen, open, close, setOpen: setIsOpen, focusTaskIndex, clearFocusTask }),
    [isOpen, open, close, focusTaskIndex, clearFocusTask]
  );
  return (
    <ScratchpadContext.Provider value={value}>
      {children}
    </ScratchpadContext.Provider>
  );
}

/** The notebook's controls where a provider exists, `null` elsewhere (a
    mention pill rendered outside the app shell). */
export function useOptionalScratchpad(): ScratchpadContextValue | null {
  return useContext(ScratchpadContext);
}

export function useScratchpad(): ScratchpadContextValue {
  const ctx = useContext(ScratchpadContext);
  if (!ctx) {
    throw new Error("useScratchpad must be used within a ScratchpadProvider");
  }
  return ctx;
}
