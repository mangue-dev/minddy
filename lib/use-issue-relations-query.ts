"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchIssueRelationsApi } from "./issue-relations-api";
import type { IssueRelation } from "./types";
import { issueRelationsKey } from "./query-keys";
import { useRelationMutations } from "./use-relation-mutations";

/** Stable while loading: memoized boards and panels keep their render. */
const NO_RELATIONS: IssueRelation[] = [];

/**
 * Project-wide issue relations (MIN-25). One list per project, kept fresh by the
 * realtime bridge invalidating ["issue-relations", projectId]. Consumers resolve
 * the per-issue view with resolveRelations().
 */
export function useIssueRelationsQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const { addRelation, removeRelation } = useRelationMutations(projectId);

  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: issueRelationsKey(projectId ?? ""),
    queryFn: () => fetchIssueRelationsApi(projectId as string, queryClient),
    enabled,
  });

  return {
    relations: data ?? NO_RELATIONS,
    loading: enabled && isPending,
    addRelation,
    removeRelation,
  };
}
