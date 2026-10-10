import type { QueryClient } from "@tanstack/react-query";

interface Label {
  value: { id: string; number: number; title: string | null } | null;
  updatedAt: number;
  invalidated: boolean;
  retiredAt?: number;
}

/** Subscribe to compact labels without adding observers to full PR payloads. */
export function createPullRequestTabLabels(client: QueryClient, ids: readonly string[]) {
  let snapshot = new Map<string, Label>();
  const serverSnapshot = new Map<string, Label>();
  const wanted = new Set(ids);
  return {
    getServerSnapshot: () => serverSnapshot,
    getSnapshot() {
      let next = snapshot;
      for (const id of ids) {
        const state = client.getQueryState<{ pr: { number: number; title?: string | null } | null }>(["pull-request", id]);
        // GC drops patches, but the last compact label remains useful offline.
        if (!state?.data) {
          const previous = snapshot.get(id);
          if (previous && previous.retiredAt === undefined) {
            if (next === snapshot) next = new Map(snapshot);
            next.set(id, { ...previous, retiredAt: Date.now() });
          }
          continue;
        }
        const pr = state.data.pr ?? null;
        const previous = snapshot.get(id);
        if (previous && previous.retiredAt === undefined && previous.updatedAt === state.dataUpdatedAt && previous.invalidated === state.isInvalidated &&
            previous.value?.number === pr?.number && (previous.value?.title ?? null) === (pr?.title ?? null) &&
            (previous.value === null) === (pr === null)) continue;
        if (next === snapshot) next = new Map(snapshot);
        next.set(id, { value: pr ? { id, number: pr.number, title: pr.title ?? null } : null,
          updatedAt: state.dataUpdatedAt, invalidated: state.isInvalidated });
      }
      snapshot = next;
      return snapshot;
    },
    subscribe(notify: () => void) {
      return client.getQueryCache().subscribe(({ query }) => {
        if (query.queryKey[0] === "pull-request" && wanted.has(String(query.queryKey[1]))) notify();
      });
    },
  };
}
