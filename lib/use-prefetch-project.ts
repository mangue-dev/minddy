"use client";

import { useCallback, useRef } from "react";
import { useQueryClient, type QueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { issuesQueryFn } from "./issues-api";
import { fetchCategoriesApi } from "./categories-api";
import { fetchMembersApi } from "./members-api";
import { objectivesQueryFn } from "./objectives-api";
import { fetchIssueRelationsApi } from "./issue-relations-api";
import { fetchIntegrationsApi } from "./integrations-api";
import { fetchViewsApi } from "./views-api";

/** The retained board boundary needs all seven reads, including saved filters. */
export function projectPreparationQueries(queryClient: QueryClient, projectId: string): FetchQueryOptions<unknown>[] {
  return [{
    queryKey: ["issues", projectId],
    queryFn: issuesQueryFn(projectId),
  }, {
    queryKey: ["categories", projectId],
    queryFn: ({ signal }) => fetchCategoriesApi(projectId, signal),
  }, {
    queryKey: ["members", projectId],
    queryFn: ({ signal }) => fetchMembersApi(projectId, signal),
  }, {
    queryKey: ["objectives", projectId],
    queryFn: objectivesQueryFn(projectId),
  }, {
    queryKey: ["issue-relations", projectId],
    queryFn: ({ signal }) => fetchIssueRelationsApi(projectId, queryClient, signal),
  }, {
    queryKey: ["integrations", projectId],
    queryFn: ({ signal }) => fetchIntegrationsApi(projectId, signal),
  }, {
    queryKey: ["views", projectId],
    queryFn: ({ signal }) => fetchViewsApi({ kind: "project", projectId }, signal),
  }];
}

/** Warm the existing account queries on intent; fresh reads are deduplicated. */
export function prefetchProjectQueries(queryClient: QueryClient, projectId: string): void {
  if (!projectId) return;
  for (const options of projectPreparationQueries(queryClient, projectId)) {
    void queryClient.prefetchQuery(options);
  }
}

/**
 * Preheats the caches of a project board for browsing intent (MIN-89).
 *
 * Opening a project follows: loading the route chunk, mounting, THEN
 * prerequisite requests. Trigger them on hover (or keyboard focus)
 * covers this delay with the time it takes the user to click — on arrival,
 * the board is most often already populated.
 */
export function usePrefetchProject() {
  const queryClient = useQueryClient();
  // One hover = one attempt, regardless of the number of round trips of the
  // cursor on the map (the `mouseenter` lights up again with each child hovered over).
  const attempted = useRef(new Set<string>());

  return useCallback(
    (projectId: string) => {
      if (!projectId || attempted.current.has(projectId)) return;
      attempted.current.add(projectId);
      prefetchProjectQueries(queryClient, projectId);
    },
    [queryClient]
  );
}
