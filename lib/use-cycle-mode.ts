"use client";

import { useCallback, useEffect } from "react";
import { useAppTabLocalState } from "./app-tab-local-state";
import { useOptionalAppTabSession } from "./app-tabs-context";

/**
 * The durable copy of "the Cycle tab is selected" (MIN-32), kept outside the
 * view system's storage: useBoardViews self-heals unknown view ids by
 * rewriting its slot, so a "cycle" sentinel there would be lost on reload.
 */
export const CYCLE_MODE_STORAGE_KEY = "minddy:cycle-mode";

function readStoredCycleMode(): boolean {
  try {
    return !!window.localStorage.getItem(CYCLE_MODE_STORAGE_KEY);
  } catch {
    return false;
  }
}

function storeCycleMode(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(CYCLE_MODE_STORAGE_KEY, "1");
    else window.localStorage.removeItem(CYCLE_MODE_STORAGE_KEY);
  } catch {
    // Storage unavailable: the mode lasts until the page closes.
  }
}

/**
 * Whether the cross-project board shows the cycle. The mode lives in the app
 * tab's state; every change is also stored, and a page without app tabs
 * (their restored address carries the mode instead) starts from the stored
 * value. It is read after mount: the server renders the views.
 */
export function useCycleMode(): [boolean, (on: boolean) => void] {
  const appTabs = useOptionalAppTabSession();
  const [cycleMode, setTabCycleMode] = useAppTabLocalState("global-cycle-mode", false);
  const setCycleMode = useCallback((on: boolean) => {
    setTabCycleMode(on);
    storeCycleMode(on);
  }, [setTabCycleMode]);
  useEffect(() => {
    if (!appTabs && readStoredCycleMode()) setTabCycleMode(true);
  }, [appTabs, setTabCycleMode]);
  return [cycleMode, setCycleMode];
}
