"use client";

import { useCallback, useState } from "react";

type IssuePanelTab = "description" | "plan";

/** Apply a new opener request without resetting user choice after effect replay. */
export function useIssuePanelTab(issueId: string | null, requested: IssuePanelTab) {
  const [state, setState] = useState({ issueId, requested, value: requested });
  let tab = state.value;
  if (state.issueId !== issueId || state.requested !== requested) {
    tab = requested;
    setState({ issueId, requested, value: requested });
  }
  const setTab = useCallback((value: IssuePanelTab) => {
    setState((current) => ({ ...current, value }));
  }, []);
  return [tab, setTab] as const;
}
