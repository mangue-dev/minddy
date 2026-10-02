/**
 * useQueryHistory - localStorage-backed search history.
 *
 * ArrowUp in the empty search field recalls previous queries
 * (shell wires this into the SearchBar/SearchView).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { removeLocalSnapshot, restoreLocalSnapshot, saveLocalSnapshot } from "@/lib/local-snapshots";

const MAX_HISTORY = 50;

function historyKey(prefix: string): string {
  return `${prefix}:history`;
}

async function loadHistory(prefix: string): Promise<string[]> {
  try {
    const stored = localStorage.getItem(historyKey(prefix));
    if (!stored) return [];
    const legacy = JSON.parse(stored);
    if (legacy?.format !== "minddy-local-v1") {
      removeLocalSnapshot(localStorage, historyKey(prefix));
      return [];
    }
    const parsed = await restoreLocalSnapshot(localStorage, historyKey(prefix), "search-history");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string").slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(prefix: string, entries: string[]): void {
  try {
    void saveLocalSnapshot(localStorage, historyKey(prefix), "search-history", entries.slice(0, MAX_HISTORY)).catch(() => {});
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
  useEffect(() => {
    let cancelled = false;
    void loadHistory(storagePrefix).then((saved) => {
      if (!cancelled) entriesRef.current = [...new Set([...(entriesRef.current ?? []), ...saved])].slice(0, MAX_HISTORY);
    });
    return () => { cancelled = true; };
  }, [storagePrefix]);

  const getEntries = useCallback(() => {
    if (entriesRef.current === null) {
      entriesRef.current = [];
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
