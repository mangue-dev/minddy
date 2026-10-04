import { type Query } from "@tanstack/react-query";
import { localSnapshotGeneration, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";
import {
  persistQueryClientSave,
  type Persister,
  type PersistedClient,
  type PersistedQueryClientSaveOptions,
} from "@tanstack/react-query-persist-client";

const SAVE_DELAY_MS = 5_000;
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

/** Snapshots retain reload recovery without placing decrypted data on disk. */
export function createQueryStorage(storage: Storage | undefined, key: string): Persister {
  let revision = 0;
  type Write = {
    client: PersistedClient;
    content: string;
    generation: number;
    revision: number;
    promise: Promise<void>;
    resolve: () => void;
    reject: (error: unknown) => void;
  };
  let queued: Write | undefined;
  let running: Write | undefined;
  let saved: { content: string; generation: number } | undefined;
  const drain = async () => {
    while (queued) {
      const write = queued;
      queued = undefined;
      running = write;
      try {
        if (write.generation === localSnapshotGeneration()) {
          const guardedStorage = { setItem: (slot: string, value: string) => {
            if (write.revision === revision && write.generation === localSnapshotGeneration()) {
              storage?.setItem(slot, value);
            }
          } } as Storage;
          await saveLocalSnapshot(guardedStorage, key, "query-cache", write.client);
          if (write.revision === revision && write.generation === localSnapshotGeneration()) {
            saved = { content: write.content, generation: write.generation };
          }
        }
        write.resolve();
      } catch (error) {
        write.reject(error);
      }
      running = undefined;
    }
  };
  return {
    persistClient: (client) => {
      if (!storage) return Promise.resolve();
      const generation = localSnapshotGeneration();
      // The save timestamp changes even for an identical cache. Keep query
      // freshness metadata in the comparison, but ignore that outer timestamp.
      const content = JSON.stringify({ buster: client.buster, clientState: client.clientState });
      if (saved?.generation === generation && saved.content === content && !running && !queued) {
        return Promise.resolve();
      }
      const existing = queued ?? running;
      if (existing?.generation === generation && existing.content === content) return existing.promise;
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      // Only the latest waiting snapshot matters. The current request remains
      // fenced by its revision and is never allowed to overwrite newer state.
      queued?.resolve();
      queued = { client, content, generation, revision: ++revision, promise, resolve, reject };
      if (!running) void drain();
      return promise;
    },
    restoreClient: async () => {
      if (!storage) return undefined;
      const value = storage.getItem(key);
      if (value && JSON.parse(value)?.format !== "minddy-local-v1") storage.removeItem(key);
      return await restoreLocalSnapshot(storage, key, "query-cache") as Awaited<ReturnType<Persister["restoreClient"]>>;
    },
    removeClient: () => {
      revision += 1;
      queued?.resolve();
      queued = undefined;
      saved = undefined;
      storage?.removeItem(key);
    },
  };
}
