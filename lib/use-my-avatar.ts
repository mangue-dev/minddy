"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { GLOBAL_BOARD_KEY } from "./use-global-board-query";

/**
 * Ma marque d'avatar.
 *
 * Les marques des autres arrivent avec les membres d'un projet ; la mienne n'a
 * pas ce véhicule (la barre latérale s'affiche avant tout projet), d'où cette
 * lecture dédiée. La graine ne change que si je la relance, donc elle est
 * gardée fraîche indéfiniment et n'est invalidée que par la mutation.
 *
 * Renvoie `null` tant que la réponse n'est pas là — pas une graine de repli, qui
 * afficherait une FAUSSE marque le temps d'une frame. `UserAvatar` rend une
 * pastille neutre dans cet intervalle. Le cache étant persisté
 * (lib/query-provider.tsx), l'attente ne concerne que la toute première visite.
 */
function avatarKey(userId: string | undefined) {
  return ["my-avatar", userId ?? null];
}

export function useMyAvatarSeed(): string | null {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: avatarKey(user?.id),
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async (): Promise<{ seed: string }> => {
      const res = await fetch("/api/me/avatar");
      if (!res.ok) throw new Error("avatar");
      return res.json();
    },
  });

  return data?.seed ?? null;
}

/** Relance le tirage. La nouvelle marque s'affiche partout dès la réponse. */
export function useRegenerateAvatar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ seed: string }> => {
      const res = await fetch("/api/me/avatar", { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(avatarKey(user?.id), data);
      // Les membres portent MA marque dans les listes déjà chargées (assignés,
      // commentaires, mentions) : elles doivent la relire.
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    },
  });
}
