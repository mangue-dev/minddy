"use client";

import { useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "minddy-docs-topics";
const EMPTY: Record<string, boolean> = {};
let preferences = EMPTY;
let initialized = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: Record<string, boolean>) {
  preferences = next;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Navigation still works when browser storage is unavailable. */ }
  listeners.forEach(listener => listener());
}

/** Remember folds for this tab, shared by desktop and mobile navigation. */
export function useDocumentationTopics(activeTopic: string | undefined) {
  const snapshot = useSyncExternalStore(subscribe, () => preferences, () => EMPTY);
  useEffect(() => {
    if (!initialized) {
      initialized = true;
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}");
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
          preferences = Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === "boolean"));
        }
      } catch { /* Ignore unavailable storage and stale preferences. */ }
      listeners.forEach(listener => listener());
    }
    if (activeTopic && preferences[activeTopic] === undefined) publish({ ...preferences, [activeTopic]: true });
  }, [activeTopic]);

  return {
    isOpen: (topic: string) => snapshot[topic] ?? false,
    setOpen: (topic: string, open: boolean) => publish({ ...preferences, [topic]: open }),
  };
}
