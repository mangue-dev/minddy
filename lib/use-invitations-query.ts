"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAuth } from "./auth-context";
import { fetchMyInvitationsApi, respondInvitationApi } from "./invitations-api";

const MY_INVITATIONS_KEY = ["my-invitations"] as const;

/** The caller's pending invitations (drives the Home banner). */
export function useMyInvitations() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: MY_INVITATIONS_KEY,
    queryFn: fetchMyInvitationsApi,
    enabled: !!userId,
  });

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
