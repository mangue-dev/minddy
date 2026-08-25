"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface IssuePanelTarget {
  projectId: string;
  issueId: string;
}

interface IssuePanelContextValue {
  target: IssuePanelTarget | null;
  openIssue: (projectId: string, issueId: string) => void;
  closeIssue: () => void;
}

const IssuePanelContext = createContext<IssuePanelContextValue | null>(null);

/** Owns the app-wide issue panel so callers can open an issue without routing. */
export function IssuePanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<IssuePanelTarget | null>(null);

  const openIssue = useCallback((projectId: string, issueId: string) => {
    if (!projectId || !issueId) return;
    setTarget({ projectId, issueId });
  }, []);
  const closeIssue = useCallback(() => setTarget(null), []);

  const value = useMemo(
    () => ({ target, openIssue, closeIssue }),
    [target, openIssue, closeIssue],
  );

  return (
    <IssuePanelContext.Provider value={value}>
      {children}
    </IssuePanelContext.Provider>
  );
}

export function useIssuePanel(): IssuePanelContextValue {
  const value = useContext(IssuePanelContext);
  if (!value) {
    throw new Error("useIssuePanel must be used inside IssuePanelProvider");
  }
  return value;
}
