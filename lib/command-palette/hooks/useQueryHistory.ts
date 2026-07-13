/**
 * useQueryHistory - localStorage-backed search history.
 *
 * ArrowUp in the empty search field recalls previous queries
 * (shell wires this into the SearchBar/SearchView).
 */

import { useCallback, useRef, useState } from "react";

const MAX_HISTORY = 50;

function historyKey(prefix: string): string {
  return `${prefix}:history`;
}

function loadHistory(prefix: string): string[] {
  try {
    const stored = localStorage.getItem(historyKey(prefix));
    if (!stored) return [];
    const parsed = JSON.parse(stored) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(prefix: string, entries: string[]): void {
  try {
    localStorage.setItem(historyKey(prefix), JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // Ignore storage errors
  }
}

export interface QueryHistory {
  /** Current navigation index (-1 = not navigating). */
  historyIndex: number;
  /** Navigate history; returns the recalled query or null. */
  navigate: (direction: "up" | "down") => string | null;
  /** Reset navigation (when the user types). */
  reset: () => void;
  /** Record a submitted query. */
  submit: (query: string) => void;
}

export function useQueryHistory(storagePrefix: string): QueryHistory {
  const [historyIndex, setHistoryIndex] = useState(-1);
  const entriesRef = useRef<string[] | null>(null);

  const getEntries = useCallback(() => {
    if (entriesRef.current === null) {
      entriesRef.current = loadHistory(storagePrefix);
    }
    return entriesRef.current;
  }, [storagePrefix]);

  const navigate = useCallback(
    (direction: "up" | "down"): string | null => {
      const entries = getEntries();
      if (entries.length === 0) return null;

      let next = historyIndex;
      if (direction === "up") {
        next = Math.min(historyIndex + 1, entries.length - 1);
      } else {
        next = historyIndex - 1;
      }

      if (next < 0) {
        setHistoryIndex(-1);
        return ""; // Back to a fresh query
      }

      setHistoryIndex(next);
      return entries[next] ?? null;
    },
    [historyIndex, getEntries]
  );

  const reset = useCallback(() => {
    setHistoryIndex(-1);
  }, []);

  const submit = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      const entries = getEntries().filter((q) => q !== trimmed);
      entries.unshift(trimmed);
      entriesRef.current = entries.slice(0, MAX_HISTORY);
      saveHistory(storagePrefix, entriesRef.current);
      setHistoryIndex(-1);
    },
    [getEntries, storagePrefix]
  );

  return { historyIndex, navigate, reset, submit };
}

export default useQueryHistory;
