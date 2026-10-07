"use client";

import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useMobileLayout } from "@/lib/use-mobile-layout";

const Context = createContext<Map<string, unknown> | null>(null);

/** A mobile session keeps the collection's controls when browsing becomes navigation. */
export function MobileCollectionStateProvider({ children }: { children: ReactNode }) {
  const store = useRef(new Map<string, unknown>());
  return <Context.Provider value={store.current}>{children}</Context.Provider>;
}

export function useMobileCollectionState<T>(route: string, control: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const mobile = useMobileLayout() === true;
  const store = useContext(Context);
  const key = `${route}:${control}`;
  const [value, setValue] = useState<T>(() => mobile && store?.has(key) ? store.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue((previous) => {
      const result = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
      if (mobile) store?.set(key, result);
      return result;
    });
  }, [mobile, store, key]);
  return [value, set];
}
