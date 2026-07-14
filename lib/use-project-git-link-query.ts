"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchProjectGitLinkApi } from "./git-integration-api";

export const projectGitLinkQueryKey = (projectId: string) =>
  ["project-git-link", projectId] as const;

/** État de liaison git d'un projet (lien courant, owner, providers dispo). */
export function useProjectGitLinkQuery(projectId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: projectGitLinkQueryKey(projectId ?? ""),
    queryFn: () => fetchProjectGitLinkApi(projectId as string),
    enabled: !!projectId,
  });
  return {
    link: data?.link ?? null,
    isOwner: !!data?.isOwner,
    providers: data?.providers ?? [],
    loading: isLoading,
  };
}
