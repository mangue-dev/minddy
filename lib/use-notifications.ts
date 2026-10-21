"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "./auth-context";
import {
  clearReadNotificationsApi,
  fetchNotificationsApi,
  markAllReadApi,
  markReadApi,
  markUnreadApi,
  removeNotificationsApi,
} from "./notifications-api";
import type { MyNotification } from "./types";

const NOTIFICATIONS_KEY = ["notifications"] as const;

/** Shallow equality: notification rows are flat records. */
function sameRow(a: MyNotification, b: MyNotification): boolean {
  const keys = Object.keys(a) as (keyof MyNotification)[];
  return (
    keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
  );
}

/**
 * Where a removed row goes back: before the first row that followed it in the
 * list it was removed from, so it keeps its place in the server's ordering.
 */
function insertionIndex(
  before: MyNotification[],
  current: MyNotification[],
  row: MyNotification
): number {
  const following = before.slice(before.indexOf(row) + 1).map((n) => n.id);
  for (const id of following) {
    const index = current.findIndex((n) => n.id === id);
    if (index !== -1) return index;
  }
  return current.length;
}

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const enabled = !!userId;
  const { data, isPending } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: fetchNotificationsApi,
    enabled,
  });

  const notifications = (data ?? []) as MyNotification[];
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
  );

  // Optimistic (MIN-40): applies the mutation in the cache immediately to
  // that the unread highlight AND the sidebar badge move without waiting.
  // Realtime reconciles the other tabs/clients.
  //
  // The rollback of a failed request undoes ONLY what that request wrote
  // (MIN-710). Restoring the whole list captured before it would also erase
  // every write that settled in the meantime — another notification marked
  // read, a deletion, a notification fetched by realtime. A row is put back
  // only while it still holds exactly what this mutation wrote: once a later
  // mutation or a refetch has changed it, the newer state wins. (Compared by
  // value: the query cache's structural sharing does not keep our objects.)
  const mutate = useCallback(
    (apply: (old: MyNotification[]) => MyNotification[]) => {
      const before =
        queryClient.getQueryData<MyNotification[]>(NOTIFICATIONS_KEY) ?? [];
      const after = apply(before);
      queryClient.setQueryData<MyNotification[]>(NOTIFICATIONS_KEY, after);
      const previousById = new Map(before.map((n) => [n.id, n]));
      const remaining = new Set(after.map((n) => n.id));
      // Id → the row written and the row it replaced.
      const written = new Map<string, { row: MyNotification; previous: MyNotification }>();
      for (const row of after) {
        const previous = previousById.get(row.id);
        if (previous && previous !== row) written.set(row.id, { row, previous });
      }
      const removed = before.filter((n) => !remaining.has(n.id));
      return () =>
        queryClient.setQueryData<MyNotification[]>(NOTIFICATIONS_KEY, (current) => {
          if (!current) return current;
          const next = current.map((n) => {
            const write = written.get(n.id);
            return write && sameRow(n, write.row) ? write.previous : n;
          });
          for (const row of removed) {
            if (next.some((n) => n.id === row.id)) continue;
            next.splice(insertionIndex(before, next, row), 0, row);
          }
          return next;
        });
    },
    [queryClient]
  );

  const run = useCallback(
    async (
      apply: (old: MyNotification[]) => MyNotification[],
      request: () => Promise<void>
    ) => {
      const rollback = mutate(apply);
      try {
        await request();
      } catch (err) {
        rollback();
        throw err;
      }
    },
    [mutate]
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      await run(
        (old) =>
          old.map((n) =>
            n.read_at || !idSet.has(n.id) ? n : { ...n, read_at: now }
          ),
        () => markReadApi(ids)
      );
    },
    [run]
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    await run(
      (old) => old.map((n) => (n.read_at ? n : { ...n, read_at: now })),
      () => markAllReadApi()
    );
  }, [run]);

  const markUnread = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      await run(
        (old) =>
          old.map((n) => (idSet.has(n.id) ? { ...n, read_at: null } : n)),
        () => markUnreadApi(ids)
      );
    },
    [run]
  );

  const remove = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      await run(
        (old) => old.filter((n) => !idSet.has(n.id)),
        () => removeNotificationsApi(ids)
      );
    },
    [run]
  );

  const clearRead = useCallback(async () => {
    await run(
      (old) => old.filter((n) => !n.read_at),
      () => clearReadNotificationsApi()
    );
  }, [run]);

  return {
    notifications,
    unreadCount,
    initialized: data !== undefined,
    loading: enabled && isPending,
    markRead,
    markAllRead,
    markUnread,
    remove,
    clearRead,
  };
}
