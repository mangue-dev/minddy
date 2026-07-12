"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "./auth-context";
import {
  fetchNotificationsApi,
  markAllReadApi,
  markReadApi,
} from "./notifications-api";
import type { MyNotification } from "./types";

const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: fetchNotificationsApi,
    enabled: !!userId,
  });

  const notifications = (data ?? []) as MyNotification[];
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications]
  );

  // Optimiste (MIN-40) : estampille `read_at` dans le cache tout de suite pour
  // que le surlignage non-lu ET le badge de la sidebar se vident sans attendre.
  // Rollback à l'échec ; le realtime réconcilie les autres onglets/clients.
  const stampRead = useCallback(
    (matches: (n: MyNotification) => boolean) => {
      const previous =
        queryClient.getQueryData<MyNotification[]>(NOTIFICATIONS_KEY);
      const now = new Date().toISOString();
      queryClient.setQueryData<MyNotification[]>(NOTIFICATIONS_KEY, (old) =>
        (old ?? []).map((n) =>
          n.read_at || !matches(n) ? n : { ...n, read_at: now }
        )
      );
      return () => queryClient.setQueryData(NOTIFICATIONS_KEY, previous);
    },
    [queryClient]
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const rollback = stampRead((n) => idSet.has(n.id));
      try {
        await markReadApi(ids);
      } catch (err) {
        rollback();
        throw err;
      }
    },
    [stampRead]
  );

  const markAllRead = useCallback(async () => {
    const rollback = stampRead(() => true);
    try {
      await markAllReadApi();
    } catch (err) {
      rollback();
      throw err;
    }
  }, [stampRead]);

  return { notifications, unreadCount, loading: isLoading, markRead, markAllRead };
}
