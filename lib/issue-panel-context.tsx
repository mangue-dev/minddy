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

type IssuePanelActions = Omit<IssuePanelContextValue, "target">;

const IssuePanelStateContext = createContext<
  { target: IssuePanelTarget | null } | undefined
>(undefined);
const IssuePanelActionsContext = createContext<IssuePanelActions | undefined>(
  undefined,
);

/** Owns the app-wide issue panel so callers can open an issue without routing. */
export function IssuePanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<IssuePanelTarget | null>(null);

  const openIssue = useCallback((projectId: string, issueId: string) => {
    if (!projectId || !issueId) return;
    setTarget({ projectId, issueId });
  }, []);
  const closeIssue = useCallback(() => setTarget(null), []);

  const state = useMemo(() => ({ target }), [target]);
  const actions = useMemo(
    () => ({ openIssue, closeIssue }),
    [openIssue, closeIssue],
  );

  return (
    <IssuePanelActionsContext.Provider value={actions}>
      <IssuePanelStateContext.Provider value={state}>
        {children}
      </IssuePanelStateContext.Provider>
    </IssuePanelActionsContext.Provider>
  );
}

export function useIssuePanel(): IssuePanelContextValue {
  const state = useContext(IssuePanelStateContext);
  const actions = useContext(IssuePanelActionsContext);
  if (!state || !actions) {
    throw new Error("useIssuePanel must be used inside IssuePanelProvider");
  }
  return { ...state, ...actions };
}

/** Reads stable panel actions without subscribing to the current target. */
export function useIssuePanelActions(): IssuePanelActions {
  const actions = useContext(IssuePanelActionsContext);
  if (!actions) {
    throw new Error("useIssuePanelActions must be used inside IssuePanelProvider");
  }
  return actions;
}

/** Subscribes only to the issue currently displayed in the global panel. */
export function useIssuePanelTarget(): IssuePanelTarget | null {
  const state = useContext(IssuePanelStateContext);
  if (!state) {
    throw new Error("useIssuePanelTarget must be used inside IssuePanelProvider");
  }
  return state.target;
}
