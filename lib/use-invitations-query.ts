"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { useAuth } from "./auth-context";
import { fetchMyInvitationsApi, respondInvitationApi } from "./invitations-api";

const MY_INVITATIONS_KEY = ["my-invitations"] as const;

/** The caller's pending invitations (drives the Home banner and the inbox). */
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

/**
 * Les invitations en attente ET le geste d'y répondre — état occupé et toasts
 * compris. Trois endroits l'offrent (la bannière de la home, l'inbox, l'étape 1
 * de l'onboarding) : ils disent la même chose avec les mêmes mots.
 */
export function useInvitationResponder() {
  const t = useTranslations("Projects");
  const { invitations, loading, respond } = useMyInvitations();
  const [busyId, setBusyId] = useState<string | null>(null);

  const answer = useCallback(
    async (invitationId: string, action: "accept" | "reject") => {
      setBusyId(invitationId);
      try {
        await respond(invitationId, action);
        toast.success(
          action === "accept" ? t("invitationAccepted") : t("invitationRejected")
        );
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [respond, t]
  );

  return { invitations, loading, busyId, answer };
}
