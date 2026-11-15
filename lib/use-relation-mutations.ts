"use client";

import { useMemo } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addIssueRelationApi, removeIssueRelationApi } from "./issue-relations-api";
import {
  addRelationOptimistically,
  beginRelationRemoval,
  persistedRelationId,
  removeRelationFromCaches,
  restoreRelationInCaches,
} from "./optimistic/relation-writes";
import { findIssueAnywhere } from "./optimistic/issue-writes";
import { useUndoHistory, type UndoHistory } from "./undo/undo-context";
import { GLOBAL_BOARD_KEY, issueRelationsKey } from "./query-keys";
import type {
  GlobalBoardResponse,
  IssueRelation,
  IssueRelationType,
  RelationEndpointType,
} from "./types";

/** Endpoint kinds of a relation being added (MIN-513) — default `issue` both. */
export interface RelationKinds {
  sourceType?: RelationEndpointType;
  targetType?: RelationEndpointType;
}

/**
 * The relation writes (MIN-25) of every surface: project boards, the
 * cross-project board, the issue panels, objectives and triage. Like the issue
 * writers (lib/use-issue-mutations.ts), each one patches the project and the
 * aggregate caches at once, shows its own error and never throws.
 */
export interface RelationMutations {
  /** Resolves to the server row, or null on failure. */
  addRelation: (
    sourceId: string,
    type: IssueRelationType,
    targetId: string,
    kinds?: RelationKinds
  ) => Promise<IssueRelation | null>;
  removeRelation: (relationId: string) => Promise<boolean>;
}

const relationSnapshot = ({ source_id, target_id, type, source_type, target_type }: IssueRelation) => ({
  source_id,
  target_id,
  type,
  source_type,
  target_type,
});

/** The project of an issue or objective, from the cached rows. */
function endpointProject(client: QueryClient, id: string): string | undefined {
  const issue = findIssueAnywhere(client, id);
  if (issue) return issue.project_id;
  const board = client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
  for (const [projectId, objectives] of Object.entries(board?.objectives ?? {})) {
    if (objectives.some((o) => o.id === id)) return projectId;
  }
  return undefined;
}

function cachedRelation(client: QueryClient, projectId: string | null, id: string): IssueRelation | undefined {
  const own = projectId
    ? client.getQueryData<IssueRelation[]>(issueRelationsKey(projectId))?.find((r) => r.id === id)
    : undefined;
  return own ?? client.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY)?.relations.find((r) => r.id === id);
}

function showError(err: unknown): void {
  toast.error((err as Error).message);
}

export function createRelationMutations({
  queryClient,
  record,
  currentLink,
  projectId: knownProject,
}: {
  queryClient: QueryClient;
  record: UndoHistory["record"];
  currentLink: UndoHistory["currentLink"];
  /** The project the writes belong to, when the caller knows it; otherwise
      it is read from the cached endpoint rows (relations are same-project). */
  projectId: string | null;
}): RelationMutations {
  const projectOf = (sourceId: string, targetId: string) =>
    knownProject ?? endpointProject(queryClient, sourceId) ?? endpointProject(queryClient, targetId);

  const addRelation: RelationMutations["addRelation"] = async (sourceId, type, targetId, kinds) => {
    const projectId = projectOf(sourceId, targetId);
    if (!projectId) return null;
    const input = {
      source_id: sourceId,
      target_id: targetId,
      type,
      source_type: kinds?.sourceType,
      target_type: kinds?.targetType,
    };
    // Read before awaiting: the selection gesture that asked for it is over
    // by the time the server answers (MIN-795).
    const link = currentLink();
    try {
      const created = await addRelationOptimistically(queryClient, projectId, input, () =>
        addIssueRelationApi(projectId, input)
      );
      // The server-normalized row (blocked_by is stored as an inverted
      // blocks), so a redo replays exactly what was persisted.
      record({
        kind: "relation-add",
        projectId,
        relationId: created.id,
        relation: relationSnapshot(created),
      }, undefined, link);
      // The aggregate board already holds the server row: refetching that
      // heavy read would only confirm it.
      void queryClient.invalidateQueries({ queryKey: issueRelationsKey(projectId) });
      return created;
    } catch (err) {
      showError(err);
      return null;
    }
  };

  const removeRelation: RelationMutations["removeRelation"] = async (relationId) => {
    const link = currentLink();
    let id: string;
    try {
      id = await persistedRelationId(queryClient, relationId);
    } catch (err) {
      showError(err);
      return false;
    }
    const removed = cachedRelation(queryClient, knownProject, id);
    const projectId = knownProject ?? (removed ? projectOf(removed.source_id, removed.target_id) : undefined);
    if (!projectId) return false;
    // Registered before the caches drop the row, so a read already in flight
    // cannot bring it back once the DELETE is confirmed.
    const removal = beginRelationRemoval(queryClient, projectId, id);
    removeRelationFromCaches(queryClient, projectId, id);
    try {
      await removeIssueRelationApi(id);
      removal.settle();
      if (removed) {
        record({
          kind: "relation-remove",
          projectId,
          relationId: id,
          relation: relationSnapshot(removed),
        }, undefined, link);
      }
      void queryClient.invalidateQueries({ queryKey: issueRelationsKey(projectId) });
      return true;
    } catch (err) {
      removal.fail();
      if (removed) restoreRelationInCaches(queryClient, projectId, removed);
      showError(err);
      return false;
    }
  };

  return { addRelation, removeRelation };
}

/** The relation writers, for one project when `projectId` is given. */
export function useRelationMutations(projectId: string | null = null): RelationMutations {
  const queryClient = useQueryClient();
  const { record, currentLink } = useUndoHistory();
  return useMemo(
    () => createRelationMutations({ queryClient, record, currentLink, projectId }),
    [queryClient, record, currentLink, projectId]
  );
}
