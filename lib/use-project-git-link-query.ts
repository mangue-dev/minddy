"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchGitLinkedProjectsApi,
  fetchProjectGitLinkApi,
} from "./git-integration-api";

export const projectGitLinkQueryKey = (projectId: string) =>
  ["project-git-link", projectId] as const;

/**
 * Deliberately OUT of the `["projects", …]` prefix: this is not the list of
 * projects, it is a set of ids — and the RealtimeProvider monitors this prefix
 * to know which topics to subscribe to.
 */
export const GIT_LINKED_PROJECTS_KEY = ["git-linked-projects"] as const;

/**
 * Projects where the agent can work: those that have a linked repository. Rendered as
 * `Set` — the caller is filtering a list of projects, it is not looking for an id.
 *
 * `loading` count: as long as the answer is not there, the set is EMPTY, and
 * a screen which would conclude "no repository connected » above would be wrong the time
 * of a round trip.
 */
export function useGitLinkedProjectsQuery() {
  const { data, isPending } = useQuery({
    queryKey: GIT_LINKED_PROJECTS_KEY,
    queryFn: fetchGitLinkedProjectsApi,
  });
  const projectIds = useMemo(
    () => new Set(data?.projectIds ?? []),
    [data],
  );
  return { projectIds, loading: isPending };
}

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
