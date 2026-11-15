"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { globalBoardQueryFn } from "./global-board-api";
import { refreshGlobalIssueSnapshot } from "./global-issues-api";
import { GLOBAL_BOARD_KEY } from "./query-keys";
import { useIssueMutations } from "./use-issue-mutations";
import { useRelationMutations } from "./use-relation-mutations";
import type { GlobalBoardResponse, Issue, IssueRelation } from "./types";

const BOARD_CACHE_STALE_MS = 5 * 60_000;
// Stable while loading: fresh fallbacks each render broke the board's memos.
const NO_ISSUES: Issue[] = [];
const NO_RELATIONS: IssueRelation[] = [];
const NO_MEMBERS_BY_PROJECT: GlobalBoardResponse["members"] = {};
const NO_CATEGORIES_BY_PROJECT: GlobalBoardResponse["categories"] = {};
const NO_OBJECTIVES_BY_PROJECT: GlobalBoardResponse["objectives"] = {};
const NO_INTEGRATIONS_BY_PROJECT: GlobalBoardResponse["integrations"] = {};

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
  // The project of each write is read from the cached endpoint rows.
  const { addRelation, removeRelation } = useRelationMutations();

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
