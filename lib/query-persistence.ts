import { type Query } from "@tanstack/react-query";
import { localSnapshotGeneration, restoreLocalSnapshot, saveLocalSnapshot } from "./local-snapshots";
import { fitsQuerySnapshotBudget } from "./query-snapshot-budget";
import {
  persistQueryClientSave,
  type Persister,
  type PersistedClient,
  type PersistedQueryClientSaveOptions,
} from "@tanstack/react-query-persist-client";

const SAVE_DELAY_MS = 5_000;
const IDLE_TIMEOUT_MS = 1_000;
const MAX_FALLBACK_QUERIES = 128;
type SnapshotRecord = Record<string, unknown>;
type SnapshotContainer = SnapshotRecord | readonly unknown[];

function plainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Read envelope structure without invoking an accessor or serialization hook. */
function ownValue(value: SnapshotContainer, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function replaceDataProperty<T extends SnapshotRecord>(value: T, key: string, replacement: unknown): T {
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(value);
  descriptors[key] = { ...descriptors[key], value: replacement };
  return Object.create(Object.getPrototypeOf(value), descriptors);
}

/**
 * Payloads that can never fit on their own, per account storage. A data
 * object that fails the budget alone makes its query and the whole client
 * fail too, so later saves skip it without walking it again. Only negative
 * verdicts are kept: a payload is never admitted without a fresh walk. The
 * hashes remember which queries were oversized, so a new payload under the
 * same key is measured alone first instead of through the whole client.
 */
export type OversizedQueryMemo = { data: WeakSet<object>; hashes: Set<string> };

export function createOversizedQueryMemo(): OversizedQueryMemo {
  return { data: new WeakSet(), hashes: new Set() };
}

function queryData(query: unknown): object | undefined {
  if (!plainRecord(query)) return undefined;
  const state = ownValue(query, "state");
  const data = plainRecord(state) ? ownValue(state, "data") : undefined;
  return data && typeof data === "object" ? data : undefined;
}

/** Keep complete small queries when one optional query exceeds the existing snapshot budget. */
export function boundedQuerySnapshot(client: PersistedClient, preferredHashes?: () => ReadonlySet<string>,
  memo?: OversizedQueryMemo): PersistedClient | null {
  try {
    if (!plainRecord(client) || typeof ownValue(client, "buster") !== "string" ||
        typeof ownValue(client, "timestamp") !== "number" || !Number.isFinite(ownValue(client, "timestamp"))) return null;
    const state = ownValue(client, "clientState");
    if (!plainRecord(state)) return null;
    const queries = ownValue(state, "queries"), mutations = ownValue(state, "mutations");
    if (!Array.isArray(queries) || Object.getPrototypeOf(queries) !== Array.prototype ||
        !Array.isArray(mutations) || Object.getPrototypeOf(mutations) !== Array.prototype) return null;
    let knownOversized = false;
    if (memo) {
      for (let index = 0; index < queries.length; index++) {
        const query = ownValue(queries, String(index)), data = queryData(query);
        if (!data) continue;
        const hash = plainRecord(query) ? ownValue(query, "queryHash") : undefined;
        if (!memo.data.has(data) && typeof hash === "string" && memo.hashes.has(hash)) {
          if (fitsQuerySnapshotBudget(data)) memo.hashes.delete(hash);
          else memo.data.add(data);
        }
        if (memo.data.has(data)) knownOversized = true;
      }
    }
    const fits = !knownOversized && fitsQuerySnapshotBudget(client);
    if (!fits && queries.length > MAX_FALLBACK_QUERIES) return null;
    if (fits) {
      for (let index = 0; index < queries.length; index++) {
        const query = ownValue(queries, String(index));
        if (!plainRecord(query) || typeof ownValue(query, "queryHash") !== "string" ||
            !Array.isArray(ownValue(query, "queryKey")) || !plainRecord(ownValue(query, "state"))) return null;
      }
      return client;
    }
    // Validate the preserved envelope and mutations before inspecting optional
    // query payloads. Extra metadata remains part of the final whole budget.
    const emptyState = replaceDataProperty(state, "queries", []);
    const emptyClient = replaceDataProperty(client, "clientState", emptyState);
    if (!fitsQuerySnapshotBudget(emptyClient)) return null;
    const retained = [];
    for (let index = 0; index < queries.length; index++) {
      const query = ownValue(queries, String(index));
      if (!plainRecord(query) || typeof ownValue(query, "queryHash") !== "string" ||
          !Array.isArray(ownValue(query, "queryKey")) || !plainRecord(ownValue(query, "state"))) return null;
      const data = queryData(query), hash = ownValue(query, "queryHash") as string;
      if (data && memo?.data.has(data)) continue;
      if (fitsQuerySnapshotBudget(query)) {
        retained.push(query);
        memo?.hashes.delete(hash);
      } else memo?.hashes.add(hash);
    }
    if (!retained.length && !mutations.length) return null;
    const candidate = replaceDataProperty(client, "clientState", replaceDataProperty(state, "queries", retained));
    if (fitsQuerySnapshotBudget(candidate)) return candidate;
    if (!preferredHashes) return null;
    // Admission describes complete query ownership, never a row or byte quota.
    // Read it only when the otherwise eligible collection cannot fit together.
    const hashes = preferredHashes();
    const preferred = retained.filter((query) => {
      const hash = ownValue(query, "queryHash");
      return typeof hash === "string" && hashes.has(hash);
    });
    if (!preferred.length && !mutations.length) return null;
    const workingSet = replaceDataProperty(client, "clientState", replaceDataProperty(state, "queries", preferred));
    return fitsQuerySnapshotBudget(workingSet) ? workingSet : null;
  } catch { return null; }
}

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
    /** Persisted data updated at or after this time is not on disk yet. */
    unsavedSince?: number;
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
  let unsaved = false;
  for (const query of queryClient.getQueryCache().getAll()) {
    const value = snapshot(query);
    if (!value) continue;
    snapshots.set(query, value);
    if (options.unsavedSince !== undefined && value.updatedAt >= options.unsavedSince) unsaved = true;
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
  if (unsaved) schedule();

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
export function createQueryStorage(storage: Storage | undefined, key: string, preferredHashes?: () => ReadonlySet<string>): Persister {
  let revision = 0;
  const oversized = createOversizedQueryMemo();
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
  const remove = () => {
    revision += 1;
    queued?.resolve();
    queued = undefined;
    saved = undefined;
    storage?.removeItem(key);
  };
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
      const bounded = boundedQuerySnapshot(client, preferredHashes, oversized);
      if (!bounded) {
        // The cache remains live in memory. Retire the previous disk snapshot
        // and pending writes so a later reload cannot resurrect obsolete state.
        remove();
        return Promise.resolve();
      }
      client = bounded;
      const generation = localSnapshotGeneration();
      // The save timestamp changes even for an identical cache. Keep query
      // freshness metadata in the comparison, but ignore that outer timestamp.
      // JSON ignores symbol properties. Copy only enumerable string data
      // descriptors so an ignored symbol getter cannot run during object rest.
      const persistedState = Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(client))
        .filter(([name, descriptor]) => name !== "timestamp" && descriptor.enumerable)
        .map(([name, descriptor]) => [name, descriptor.value]));
      const content = JSON.stringify(persistedState);
      if (saved?.generation === generation && saved.content === content && !running && !queued) {
        return Promise.resolve();
      }
      const existing = queued ?? running;
      if (existing?.generation === generation && existing.revision === revision && existing.content === content) return existing.promise;
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
      // Copy the already bounded JSON. A queued seal may run after an auth await;
      // mutable cache references must not grow past the checked budget meanwhile.
      const snapshotClient: PersistedClient = { timestamp: client.timestamp, ...JSON.parse(content) };
      // Only the latest waiting snapshot matters. The current request remains
      // fenced by its revision and is never allowed to overwrite newer state.
      queued?.resolve();
      queued = { client: snapshotClient, content, generation, revision: ++revision, promise, resolve, reject };
      if (!running) void drain();
      return promise;
    },
    restoreClient: async () => {
      if (!storage) return undefined;
      const value = storage.getItem(key);
      if (value && JSON.parse(value)?.format !== "minddy-local-v1") storage.removeItem(key);
      return await restoreLocalSnapshot(storage, key, "query-cache") as Awaited<ReturnType<Persister["restoreClient"]>>;
    },
    removeClient: remove,
  };
}
