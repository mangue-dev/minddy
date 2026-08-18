"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { GLOBAL_BOARD_KEY } from "./use-global-board-query";

/**
 * My avatar mark.
 *
 * Others' marks arrive with members of a project; mine does not have this vehicle (the sidebar appears before any project), hence this dedicated reading. The seed only changes if I restart it, so it is
 * kept fresh indefinitely and is only invalidated by mutation.
 *
 * Returns `null` until the response is there — not a fallback seed, which
 * would show a FALSE timemark of one frame. `UserAvatar` returns a
 * neutral pellet in this interval. Since the cache is persisted
 * (lib/query-provider.tsx), the wait only concerns the very first visit.
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

/** Restarts the draw. The new brand is displayed everywhere upon response. */
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
      // The members bear MY mark in the lists already loaded (assigned,
      // comments, mentions): they must reread it.
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
    },
  });
}
