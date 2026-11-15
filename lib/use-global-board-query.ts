"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { globalBoardQueryFn } from "./global-board-api";
import { refreshGlobalIssueSnapshot } from "./global-issues-api";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";
import {
  addIssueRelationApi,
  removeIssueRelationApi,
} from "./issue-relations-api";
import {
  addRelationOptimistically,
  beginRelationRemoval,
  persistedRelationId,
} from "./optimistic/relation-writes";
import type { RelationKinds } from "./use-issue-relations-query";
import { useIssueMutations } from "./use-issue-mutations";
import { useUndoHistory } from "./undo/undo-context";
import type {
  GlobalBoardResponse,
  Issue,
  IssueRelation,
  IssueRelationType,
} from "./types";

/** Cache key for the aggregate cross-project board (MIN-29), declared in
    lib/optimistic/issue-writes.ts and re-exported where the app reads it. */
export { GLOBAL_BOARD_KEY };

const BOARD_CACHE_STALE_MS = 5 * 60_000;
// Stable while loading: fresh fallbacks each render broke the board's memos.
const NO_ISSUES: Issue[] = [];
const NO_RELATIONS: IssueRelation[] = [];
const NO_MEMBERS_BY_PROJECT: GlobalBoardResponse["members"] = {};
const NO_CATEGORIES_BY_PROJECT: GlobalBoardResponse["categories"] = {};
const NO_OBJECTIVES_BY_PROJECT: GlobalBoardResponse["objectives"] = {};
const NO_INTEGRATIONS_BY_PROJECT: GlobalBoardResponse["integrations"] = {};

/** The project an issue or objective belongs to, from the board's own rows
    (relations are same-project by construction). */
function endpointProject(board: GlobalBoardResponse | undefined, id: string): string | undefined {
  const issue = board?.issues.find((i) => i.id === id);
  if (issue) return issue.project_id;
  for (const [projectId, objectives] of Object.entries(board?.objectives ?? {})) {
    if (objectives.some((o) => o.id === id)) return projectId;
  }
  return undefined;
}

const relationSnapshot = ({ source_id, target_id, type, source_type, target_type }: IssueRelation) => ({
  source_id,
  target_id,
  type,
  source_type,
  target_type,
});

/**
 * The cross-project "My/All" kanban's data and writes. Issue writes are the
 * shared ones (lib/use-issue-mutations.ts): they patch this aggregate cache AND
 * the touched project's `["issues", projectId]` cache, and merge the server row
 * rather than invalidate (MIN-156) — `/api/me/board` is a heavy route, and each
 * needless refetch was one more window for a late response to overwrite an edit.
 */
export function useGlobalBoardQuery() {
  const queryClient = useQueryClient();
  const mutations = useIssueMutations("global");
  const { record, currentLink } = useUndoHistory();

  const fastSyncOnMount = useRef<boolean | null>(null);
  if (fastSyncOnMount.current === null) {
    const state = queryClient.getQueryState<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
    fastSyncOnMount.current =
      !!state?.data &&
      (state.isInvalidated ||
        Date.now() - state.dataUpdatedAt >= BOARD_CACHE_STALE_MS);
  }

  const { data, isPending } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    // No short staleTime: since MIN-89 the realtime bridge invalidates this key
    // on any issue change in ANY of my projects (before, it only followed the
    // project in the URL, hence a short refresh). The global default of 5 min
    // stays — the event carries the freshness.
  });

  useEffect(() => {
    if (!fastSyncOnMount.current) return;
    fastSyncOnMount.current = false;
    void refreshGlobalIssueSnapshot(queryClient).catch(() => {
      // The aggregate query mounted above remains the fallback.
    });
  }, [queryClient]);

  // Relations (MIN-25) on the cross-project board: the writes go through the
  // per-project routes, so the project is read from a cached endpoint row. The
  // board cache's `relations` slice is patched at once and the project's own
  // ["issue-relations"] cache invalidated, so both boards stay in sync.
  const addRelation = useCallback(
    async (
      sourceId: string,
      type: IssueRelationType,
      targetId: string,
      kinds?: RelationKinds
    ) => {
      const board = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const projectId = endpointProject(board, sourceId) ?? endpointProject(board, targetId);
      if (!projectId) return;
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
        // Record the server-normalized row (blocked_by is stored as an inverted
        // blocks), so a redo replays exactly what was persisted.
        record({
          kind: "relation-add",
          projectId,
          relationId: created.id,
          relation: relationSnapshot(created),
        }, undefined, link);
        // The board's relation slice already holds the server row: refetching
        // the whole aggregate would only confirm it.
        void queryClient.invalidateQueries({ queryKey: ["issue-relations", projectId] });
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [queryClient, record, currentLink]
  );

  const removeRelation = useCallback(
    async (relationId: string) => {
      const link = currentLink();
      try {
        relationId = await persistedRelationId(queryClient, relationId);
      } catch (err) {
        toast.error((err as Error).message);
        return;
      }
      const board = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const removed = board?.relations.find((r) => r.id === relationId);
      const projectId = removed
        ? endpointProject(board, removed.source_id) ?? endpointProject(board, removed.target_id)
        : undefined;
      if (!removed || !projectId) return;
      // Registered first, so a board read already in flight cannot bring the
      // row back once the DELETE is confirmed.
      const removal = beginRelationRemoval(queryClient, projectId, relationId);
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? { ...old, relations: old.relations.filter((r) => r.id !== relationId) }
          : old
      );
      try {
        await removeIssueRelationApi(relationId);
        removal.settle();
        record({
          kind: "relation-remove",
          projectId,
          relationId,
          relation: relationSnapshot(removed),
        }, undefined, link);
        void queryClient.invalidateQueries({
          queryKey: ["issue-relations", projectId],
        });
      } catch (err) {
        removal.fail();
        queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
          old && !old.relations.some((r) => r.id === relationId)
            ? { ...old, relations: [...old.relations, removed] }
            : old
        );
        toast.error((err as Error).message);
      }
    },
    [queryClient, record, currentLink]
  );

  return {
    issues: (data?.issues ?? NO_ISSUES) as Issue[],
    membersByProject: data?.members ?? NO_MEMBERS_BY_PROJECT,
    categoriesByProject: data?.categories ?? NO_CATEGORIES_BY_PROJECT,
    objectivesByProject: data?.objectives ?? NO_OBJECTIVES_BY_PROJECT,
    integrationsByProject: data?.integrations ?? NO_INTEGRATIONS_BY_PROJECT,
    relations: (data?.relations ?? NO_RELATIONS) as IssueRelation[],
    cycles: data?.cycles ?? null,
    loading: isPending,
    /** The open columns are painted; the other statuses have not landed yet. */
    deferredPending: data?.deferred_pending === true,
    updateIssue: mutations.updateIssue,
    moveIssue: mutations.moveIssue,
    setCategories: mutations.setCategories,
    deleteIssue: mutations.deleteIssue,
    setIssueCycle: mutations.setIssueCycle,
    addRelation,
    removeRelation,
  };
}
