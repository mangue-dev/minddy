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

/** Open state of the personal Notes modal, lifted so the header button, the
    command palette and the `G N` keyboard chord can all open it. */
interface ScratchpadContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const ScratchpadContext = createContext<ScratchpadContextValue | null>(null);

export function ScratchpadProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const value = useMemo<ScratchpadContextValue>(
    () => ({ isOpen, open, close, toggle, setOpen: setIsOpen }),
    [isOpen, open, close, toggle]
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
