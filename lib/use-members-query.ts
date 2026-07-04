"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import {
  cancelInvitationApi,
  fetchMembersApi,
  inviteMemberApi,
  removeMemberApi,
} from "./members-api";
import type { MembersResponse } from "./types";

const membersKey = (projectId: string) => ["members", projectId] as const;

export function useMembersQuery(projectId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: membersKey(projectId ?? ""),
    queryFn: () => fetchMembersApi(projectId as string),
    enabled: enabled && !!projectId,
  });

  useEffect(() => {
    if (!enabled || !projectId) return;
    const supabase = getSupabase();
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: membersKey(projectId) });

    const membersChannel = supabase
      .channel(`members:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_members",
          filter: `project_id=eq.${projectId}`,
        },
        invalidate
      )
      .subscribe();

    const invitesChannel = supabase
      .channel(`members-invites:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_invitations",
          filter: `project_id=eq.${projectId}`,
        },
        invalidate
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(membersChannel);
      void supabase.removeChannel(invitesChannel);
    };
  }, [queryClient, projectId, channelId, enabled]);

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: membersKey(projectId) });
    }
  }, [queryClient, projectId]);

  const invite = useCallback(
    async (email: string) => {
      await inviteMemberApi(projectId as string, email);
      invalidate();
    },
    [projectId, invalidate]
  );

  const cancelInvitation = useCallback(
    async (invitationId: string) => {
      await cancelInvitationApi(projectId as string, invitationId);
      invalidate();
    },
    [projectId, invalidate]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      await removeMemberApi(projectId as string, userId);
      invalidate();
    },
    [projectId, invalidate]
  );

  const value: MembersResponse = data ?? {
    members: [],
    invitations: [],
    isOwner: false,
  };

  return {
    members: value.members,
    invitations: value.invitations,
    isOwner: value.isOwner,
    loading: isLoading,
    invite,
    cancelInvitation,
    removeMember,
  };
}
