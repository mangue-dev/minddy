"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-context";
import { fetchMyInvitationsApi, respondInvitationApi } from "./invitations-api";

const MY_INVITATIONS_KEY = ["my-invitations"] as const;

/** The caller's pending invitations (drives the Home banner). */
export function useMyInvitations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: MY_INVITATIONS_KEY,
    queryFn: fetchMyInvitationsApi,
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`my-invitations:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_invitations",
          filter: `invited_user_id=eq.${userId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: MY_INVITATIONS_KEY })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId, channelId]);

  const respond = useCallback(
    async (invitationId: string, action: "accept" | "reject") => {
      const result = await respondInvitationApi(invitationId, action);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: MY_INVITATIONS_KEY }),
        // Accepting joins a project — refresh the project list/switcher.
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      return result;
    },
    [queryClient]
  );

  return {
    invitations: data ?? [],
    loading: isLoading,
    respond,
  };
}
