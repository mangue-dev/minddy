"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { issuesQueryFn } from "./issues-api";
import { fetchCategoriesApi } from "./categories-api";
import { fetchMembersApi } from "./members-api";
import { objectivesQueryFn } from "./objectives-api";
import { fetchIssueRelationsApi } from "./issue-relations-api";

/**
 * Preheats the caches of a project board for browsing intent (MIN-89).
 *
 * Opening a project follows: loading the route chunk, mounting, THEN
 * five fan requests. Trigger them on hover (or keyboard focus)
 * covers this delay with the time it takes the user to click — on arrival,
 * the board is most often already populated.
 *
 * `prefetchQuery` respects `staleTime`: a fresh cache does not cause NONE
 * query, so hovering over ten cards in a row does not trigger ten bursts.
 * A safeguard per project also avoids asking the question again each
 * entry/exit of the cursor on the same card.
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

      // The five readings that app/(app)/projects/[id]/page.tsx shows. The views
      // and integrations are left aside: they are light and do not
      // do not block the first rendering of the board.
      void queryClient.prefetchQuery({
        queryKey: ["issues", projectId],
        queryFn: issuesQueryFn(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["categories", projectId],
        queryFn: () => fetchCategoriesApi(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["members", projectId],
        queryFn: () => fetchMembersApi(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["objectives", projectId],
        queryFn: objectivesQueryFn(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["issue-relations", projectId],
        queryFn: () => fetchIssueRelationsApi(projectId),
      });
    },
    [queryClient]
  );
}
