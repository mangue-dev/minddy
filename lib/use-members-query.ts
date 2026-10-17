"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  cancelInvitationApi,
  fetchMembersApi,
  inviteMemberApi,
  removeMemberApi,
  transferOwnershipApi,
  updateInvitationRoleApi,
  updateMemberRoleApi,
  type MemberAccessInput,
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
    async (email: string, access?: MemberAccessInput) => {
      await inviteMemberApi(projectId as string, email, access);
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

  const updateMemberRole = useCallback(
    async (userId: string, access: MemberAccessInput) => {
      const result = await updateMemberRoleApi(projectId as string, userId, access);
      invalidate();
      // A demotion unassigns the reader's open issues.
      if (access.role === "reader") {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
      return result;
    },
    [projectId, invalidate, queryClient]
  );

  const updateInvitationRole = useCallback(
    async (invitationId: string, access: MemberAccessInput) => {
      await updateInvitationRoleApi(projectId as string, invitationId, access);
      invalidate();
    },
    [projectId, invalidate]
  );

  const transferOwnership = useCallback(
    async (userId: string) => {
      const result = await transferOwnershipApi(projectId as string, userId);
      invalidate();
      // The viewer's own role changed: the project list carries `my_role`,
      // and routines were paused.
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["routines"] });
      return result;
    },
    [projectId, invalidate, queryClient]
  );

  const value: MembersResponse = data ?? {
    members: [],
    invitations: [],
    isOwner: false,
    myRole: "member",
    canComment: true,
  };

  return {
    members: value.members,
    invitations: value.invitations,
    isOwner: value.isOwner,
    myRole: value.myRole,
    canComment: value.canComment,
    loading: on && isPending,
    invite,
    cancelInvitation,
    removeMember,
    updateMemberRole,
    updateInvitationRole,
    transferOwnership,
  };
}
