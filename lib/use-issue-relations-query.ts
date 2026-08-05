"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  addIssueRelationApi,
  fetchIssueRelationsApi,
  removeIssueRelationApi,
} from "./issue-relations-api";
import { useUndoHistory } from "./undo/undo-context";
import type { IssueRelation, IssueRelationType } from "./types";

const relationsKey = (projectId: string) => ["issue-relations", projectId] as const;

/**
 * Project-wide issue relations (MIN-25). One list per project, kept fresh by the
 * realtime bridge invalidating ["issue-relations", projectId]. Consumers resolve
 * the per-issue view with resolveRelations().
 */
export function useIssueRelationsQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  // Local undo history (MIN-35): relation edits record like issue edits do.
  const { record } = useUndoHistory();

  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: relationsKey(projectId ?? ""),
    queryFn: () => fetchIssueRelationsApi(projectId as string),
    enabled,
  });

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: relationsKey(projectId) });
    }
  }, [queryClient, projectId]);

  const addRelation = useCallback(
    async (sourceId: string, type: IssueRelationType, targetId: string) => {
      if (!projectId) return;
      const created = await addIssueRelationApi(projectId, {
        source_id: sourceId,
        target_id: targetId,
        type,
      });
      // Record the server-normalized row (blocked_by → inverted blocks).
      record({
        kind: "relation-add",
        projectId,
        relationId: created.id,
        relation: {
          source_id: created.source_id,
          target_id: created.target_id,
          type: created.type,
        },
      });
      // Merge the created (or already-existing) row in immediately; realtime +
      // invalidate reconcile across clients.
      queryClient.setQueryData<IssueRelation[]>(relationsKey(projectId), (old) => {
        const rest = (old ?? []).filter((r) => r.id !== created.id);
        return [...rest, created];
      });
      invalidate();
    },
    [projectId, queryClient, invalidate, record]
  );

  const removeRelation = useCallback(
    async (relationId: string) => {
      if (!projectId) return;
      const key = relationsKey(projectId);
      const previous = queryClient.getQueryData<IssueRelation[]>(key);
      const removed = previous?.find((r) => r.id === relationId);
      queryClient.setQueryData<IssueRelation[]>(key, (old) =>
        (old ?? []).filter((r) => r.id !== relationId)
      );
      try {
        await removeIssueRelationApi(relationId);
        if (removed) {
          record({
            kind: "relation-remove",
            projectId,
            relationId,
            relation: {
              source_id: removed.source_id,
              target_id: removed.target_id,
              type: removed.type,
            },
          });
        }
        invalidate();
      } catch (err) {
        queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, invalidate, record]
  );

  return {
    relations: (data ?? []) as IssueRelation[],
    loading: enabled && isPending,
    addRelation,
    removeRelation,
  };
}
