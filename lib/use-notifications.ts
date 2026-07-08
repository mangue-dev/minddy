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

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await markReadApi(ids);
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
    [queryClient]
  );

  const markAllRead = useCallback(async () => {
    await markAllReadApi();
    void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  }, [queryClient]);

  return { notifications, unreadCount, loading: isLoading, markRead, markAllRead };
}
