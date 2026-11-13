"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import { fetchSeeded } from "./server-seed";
import { refreshResolvedMention } from "./mention-resolution";

type AvatarResponse = { avatar: string };

function avatarKey(userId: string | undefined) {
  return ["my-avatar", userId ?? null];
}

/**
 * The current account avatar source.
 *
 * The source is either a Lorelei seed or a validated uploaded-image reference.
 * It remains `null` until the first response so `UserAvatar` can render a neutral
 * placeholder instead of flashing the wrong generated face.
 */
export function useMyAvatarSource(): string | null {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: avatarKey(user?.id),
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async (): Promise<AvatarResponse> => {
      const response = await fetchSeeded("/api/me/avatar");
      if (!response.ok) throw new Error("Avatar could not be loaded");
      return response.json();
    },
  });
  return data?.avatar ?? null;
}

function useAvatarMutation(
  mutationFn: () => Promise<AvatarResponse>,
) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(avatarKey(user?.id), data);
      // Member-bearing queries contain the same account source and must update
      // immediately wherever the user is assigned, mentioned, or shown as actor.
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
      // Pills naming the account, as Numo's intro does, take the new portrait.
      if (user) refreshResolvedMention("member", user.id);
    },
  });
}

/** Switches the account to a newly generated Lorelei avatar. */
export function useRegenerateAvatar() {
  return useAvatarMutation(async () => {
    const response = await fetch("/api/me/avatar", { method: "POST" });
    if (!response.ok) {
      throw new Error(
        (await response.json().catch(() => ({}))).error ?? "Avatar change failed",
      );
    }
    return response.json();
  });
}

/** Normalizes and stores an imported account avatar image. */
export function useUploadAvatar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<AvatarResponse> => {
      const body = new FormData();
      body.append("file", file, file.name || "avatar");
      const response = await fetch("/api/me/avatar", { method: "POST", body });
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => ({}))).error ?? "Avatar upload failed",
        );
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(avatarKey(user?.id), data);
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["my-invitations"] });
      // Pills naming the account, as Numo's intro does, take the new portrait.
      if (user) refreshResolvedMention("member", user.id);
    },
  });
}
