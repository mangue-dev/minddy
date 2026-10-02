"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  addIssueRelationApi,
  fetchIssueRelationsApi,
  removeIssueRelationApi,
} from "./issue-relations-api";
import { useUndoHistory } from "./undo/undo-context";
import type {
  IssueRelation,
  IssueRelationType,
  RelationEndpointType,
} from "./types";

import { addRelationOptimistically, persistedRelationId, relationsKey } from "./optimistic/relation-writes";

/** Endpoint kinds of a relation being added (MIN-513) — default `issue` both. */
export interface RelationKinds {
  sourceType?: RelationEndpointType;
  targetType?: RelationEndpointType;
}

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
    queryFn: () => fetchIssueRelationsApi(projectId as string, queryClient),
    enabled,
  });

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: relationsKey(projectId) });
    }
  }, [queryClient, projectId]);

  const addRelation = useCallback(
    async (
      sourceId: string,
      type: IssueRelationType,
      targetId: string,
      kinds?: RelationKinds
    ) => {
      if (!projectId) return;
      const input = {
        source_id: sourceId,
        target_id: targetId,
        type,
        source_type: kinds?.sourceType,
        target_type: kinds?.targetType,
      };
      const created = await addRelationOptimistically(queryClient, projectId, input, () => addIssueRelationApi(projectId, input));
      // Record the server-normalized row (blocked_by → inverted blocks).
      record({
        kind: "relation-add",
        projectId,
        relationId: created.id,
        relation: {
          source_id: created.source_id,
          target_id: created.target_id,
          type: created.type,
          source_type: created.source_type,
          target_type: created.target_type,
        },
      });
      invalidate();
    },
    [projectId, queryClient, invalidate, record]
  );

  const removeRelation = useCallback(
    async (relationId: string) => {
      if (!projectId) return;
      relationId = await persistedRelationId(queryClient, relationId);
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
              source_type: removed.source_type,
              target_type: removed.target_type,
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
