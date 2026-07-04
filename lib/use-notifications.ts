"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo } from "react";
import { getSupabase } from "./supabase";
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
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: fetchNotificationsApi,
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`notifications:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId, channelId]);

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
