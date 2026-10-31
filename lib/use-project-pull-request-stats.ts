"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchClientRead } from "./client-read";
import { HttpResponseError } from "./backend-availability";
import type { PullRequestTimelineEntry } from "./project-stats";

/**
 * The pull requests linked to a project's tickets, with their dates, for the
 * project statistics (MIN-878). A project without a linked repository simply
 * gets an empty list.
 */
export function useProjectPullRequestStats(projectId: string) {
  const { data, isPending } = useQuery({
    queryKey: ["project-pull-request-stats", projectId],
    queryFn: async ({ signal }) => {
      const response = await fetchClientRead(`/api/projects/${projectId}/pull-request-stats`, { signal });
      if (!response.ok) throw new HttpResponseError("Pull request statistics unavailable", response.status);
      const body = (await response.json()) as { pullRequests: PullRequestTimelineEntry[] };
      return body.pullRequests;
    },
    staleTime: 60_000,
  });
  return { pullRequests: data ?? [], loading: isPending };
}
