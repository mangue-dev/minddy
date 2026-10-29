"use client";

// The app-wide page panel (MIN-777): a page or a database opened from a
// mention, a resource, a comment or another in-app link is read beside the
// current screen instead of replacing it. The panel offers "Expand" to reach
// the full page (components/global-page-panel.tsx).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface PagePanelTarget {
  projectId: string;
  pageId: string;
}

interface PagePanelActions {
  openPage: (projectId: string, pageId: string) => void;
  closePage: () => void;
}

const PagePanelStateContext = createContext<
  { target: PagePanelTarget | null } | undefined
>(undefined);
const PagePanelActionsContext = createContext<PagePanelActions | undefined>(
  undefined,
);

/** Owns the app-wide page panel so callers can open a page without routing. */
export function PagePanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PagePanelTarget | null>(null);

  const openPage = useCallback((projectId: string, pageId: string) => {
    if (!projectId || !pageId) return;
    setTarget({ projectId, pageId });
  }, []);
  const closePage = useCallback(() => setTarget(null), []);

  const state = useMemo(() => ({ target }), [target]);
  const actions = useMemo(
    () => ({ openPage, closePage }),
    [openPage, closePage],
  );

  return (
    <PagePanelActionsContext.Provider value={actions}>
      <PagePanelStateContext.Provider value={state}>
        {children}
      </PagePanelStateContext.Provider>
    </PagePanelActionsContext.Provider>
  );
}

/**
 * The panel actions, or `null` outside the authenticated app (public boards,
 * marketing, isolated tests), where a page link keeps navigating.
 */
export function useOptionalPagePanelActions(): PagePanelActions | null {
  return useContext(PagePanelActionsContext) ?? null;
}

/** Reads stable panel actions without subscribing to the current target. */
export function usePagePanelActions(): PagePanelActions {
  const actions = useContext(PagePanelActionsContext);
  if (!actions) {
    throw new Error("usePagePanelActions must be used inside PagePanelProvider");
  }
  return actions;
}

/** Subscribes only to the page currently displayed in the global panel. */
export function usePagePanelTarget(): PagePanelTarget | null {
  const state = useContext(PagePanelStateContext);
  if (!state) {
    throw new Error("usePagePanelTarget must be used inside PagePanelProvider");
  }
  return state.target;
}
