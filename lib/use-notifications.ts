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

  // Optimiste (MIN-40) : applique la mutation dans le cache tout de suite pour
  // que le surlignage non-lu ET le badge de la sidebar bougent sans attendre.
  // Rollback à l'échec ; le realtime réconcilie les autres onglets/clients.
  const mutate = useCallback(
    (apply: (old: MyNotification[]) => MyNotification[]) => {
      const previous =
        queryClient.getQueryData<MyNotification[]>(NOTIFICATIONS_KEY);
      queryClient.setQueryData<MyNotification[]>(NOTIFICATIONS_KEY, (old) =>
        apply(old ?? [])
      );
      return () => queryClient.setQueryData(NOTIFICATIONS_KEY, previous);
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
    loading: enabled && isPending,
    markRead,
    markAllRead,
    markUnread,
    remove,
    clearRead,
  };
}
