"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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

  const on = enabled && !!projectId;
  const { data, isPending } = useQuery({
    queryKey: membersKey(projectId ?? ""),
    queryFn: () => fetchMembersApi(projectId as string),
    enabled: on,
  });

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
    loading: on && isPending,
    invite,
    cancelInvitation,
    removeMember,
  };
}
