"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchProjectGitLinkApi } from "./git-integration-api";

export const projectGitLinkQueryKey = (projectId: string) =>
  ["project-git-link", projectId] as const;

/**
 * Deliberately OUT of the `["projects", …]` prefix: this is not the list of
 * projects, it is a set of ids — and the RealtimeProvider monitors this prefix
 * to know which topics to subscribe to.
 */
export const GIT_LINKED_PROJECTS_KEY = ["git-linked-projects"] as const;

/** Git link status of a project (current link, owner, providers available). */
export function useProjectGitLinkQuery(projectId: string | null) {
  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: projectGitLinkQueryKey(projectId ?? ""),
    queryFn: () => fetchProjectGitLinkApi(projectId as string),
    enabled,
  });
  return {
    link: data?.link ?? null,
    isOwner: !!data?.isOwner,
    providers: data?.providers ?? [],
    /** See `ProjectGitLinkResponse` — null when there is nothing to report. */
    writeMissingUrl: data?.writeMissingUrl ?? null,
    loading: enabled && isPending,
  };
}
