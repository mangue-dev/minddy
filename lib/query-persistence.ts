import { type Query } from "@tanstack/react-query";
import {
  persistQueryClientSave,
  type Persister,
  type PersistedQueryClientSaveOptions,
} from "@tanstack/react-query-persist-client";

const SAVE_DELAY_MS = 1_000;
const IDLE_TIMEOUT_MS = 1_000;

/** Coalesce the entire snapshot operation, including dehydration, until idle. */
export function scheduleQuerySnapshot(save: () => void): () => void {
  let cancelled = false;
  let idle: number | undefined;
  const run = () => {
    if (!cancelled) save();
  };
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback === "function") {
      idle = requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    } else {
      run();
    }
  }, SAVE_DELAY_MS);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(idle);
    }
  };
}

type QuerySnapshot = { data: unknown; updatedAt: number } | null;

/**
 * TanStack's default subscription dehydrates every cache entry on every cache
 * event, before its storage throttle. Polling an excluded query consequently
 * still scans the whole workspace. Track only changes to persisted data, then
 * build one snapshot for a burst of writes outside the interaction task.
 */
export function subscribeToQueryPersistence(
  options: PersistedQueryClientSaveOptions & {
    shouldPersistQuery: (query: Query) => boolean;
  },
): { stop: () => void; flush: () => void } {
  const { queryClient, shouldPersistQuery } = options;
  const snapshots = new Map<Query, QuerySnapshot>();
  let cancelScheduled: (() => void) | undefined;
  let stopped = false;

  const snapshot = (query: Query): QuerySnapshot =>
    shouldPersistQuery(query)
      ? { data: query.state.data, updatedAt: query.state.dataUpdatedAt }
      : null;
  for (const query of queryClient.getQueryCache().getAll()) {
    const value = snapshot(query);
    if (value) snapshots.set(query, value);
  }

  const save = () => {
    cancelScheduled = undefined;
    if (stopped) return;
    // Persistence is optional: quota or storage failures must never reject an
    // interaction or leave an unhandled promise rejection.
    void persistQueryClientSave(options).catch(() => {});
  };
  const schedule = () => {
    if (!stopped && !cancelScheduled) {
      cancelScheduled = scheduleQuerySnapshot(save);
    }
  };

  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "added" && event.type !== "removed" && event.type !== "updated") return;
    const previous = snapshots.get(event.query) ?? null;
    const next = event.type === "removed" ? null : snapshot(event.query);
    if (next) snapshots.set(event.query, next);
    else snapshots.delete(event.query);
    if (
      previous?.data !== next?.data ||
      previous?.updatedAt !== next?.updatedAt ||
      (previous === null) !== (next === null)
    ) {
      schedule();
    }
  });

  // Preserve TanStack's paused-mutation persistence semantics. Ordinary online
  // mutations do not change the snapshot and need no cache-wide work.
  const pausedMutations = new Set(
    queryClient.getMutationCache().getAll().filter((mutation) => mutation.state.isPaused),
  );
  const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "added" && event.type !== "removed" && event.type !== "updated") return;
    const wasPaused = pausedMutations.has(event.mutation);
    const isPaused = event.type !== "removed" && event.mutation.state.isPaused;
    if (isPaused) pausedMutations.add(event.mutation);
    else pausedMutations.delete(event.mutation);
    if (wasPaused || isPaused) schedule();
  });

  return {
    flush: () => {
      if (!cancelScheduled || stopped) return;
      cancelScheduled();
      save();
    },
    stop: () => {
      stopped = true;
      cancelScheduled?.();
      cancelScheduled = undefined;
      unsubscribeQueries();
      unsubscribeMutations();
      snapshots.clear();
      pausedMutations.clear();
    },
  };
}

/** Synchronous storage avoids a second timer after the snapshot is prepared. */
export function createQueryStorage(storage: Storage | undefined, key: string): Persister {
  return {
    persistClient: (client) => {
      storage?.setItem(key, JSON.stringify(client));
    },
    restoreClient: () => {
      const value = storage?.getItem(key);
      return value ? JSON.parse(value) : undefined;
    },
    removeClient: () => {
      storage?.removeItem(key);
    },
  };
}
