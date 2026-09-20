"use client";
import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { useOptionalAppTabNavigation } from "./app-tabs-context";

/** Lightweight UI restoration owned by a tab, without mounting inactive pages. */
export function useAppTabLocalState<T>(scope: string, initial: T): [T, (next: SetStateAction<T>) => void] {
  const tabs = useOptionalAppTabNavigation();
  const session = tabs?.session;
  const key = `${tabs?.activeId ?? "initial"}:${scope}`;
  const [state, setState] = useState(() => ({ key, value: session?.getLocalState<T>(key) ?? initial }));
  let value = state.value;
  if (state.key !== key) {
    // The page may consume a startup deep link while the tab list is loading.
    // Hand that initial selection to the first active tab instead of resetting it.
    value = session?.getLocalState<T>(key) ?? (state.key === `initial:${scope}` ? state.value : initial);
    setState({ key, value });
  }
  const set = useCallback((next: SetStateAction<T>) => {
    setState((current) => {
      const previous = current.key === key ? current.value : session?.getLocalState<T>(key) ?? initial;
      const result = typeof next === "function" ? (next as (old: T) => T)(previous) : next;
      return { key, value: result };
    });
  }, [key, session, initial]);
  useEffect(() => {
    if (state.key === key) session?.setLocalState(key, state.value);
  }, [key, session, state]);
  return [value, set];
}
