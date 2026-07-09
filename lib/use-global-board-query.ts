"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { fetchGlobalBoardApi } from "./global-board-api";
import {
  createIssueApi,
  deleteIssueApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import { useAuth } from "./auth-context";
import { autoAssignOnStart } from "./auto-assign-on-start";
import type {
  CreateIssueInput,
  GlobalBoardResponse,
  Issue,
  IssueUpdateInput,
} from "./types";

/** Cache key for the aggregate cross-project board (MIN-29). */
export const GLOBAL_BOARD_KEY = ["me", "board"] as const;

/**
 * The cross-project "My/All" kanban's data + writes. Edits go through the
 * by-id issue APIs (which are project-agnostic), optimistically patch this
 * aggregate cache, then invalidate both it and the touched project's
 * `["issues", projectId]` cache so the project board reflects the change too.
 * Mirrors useIssuesQuery, including self-assign-on-start.
 */
export function useGlobalBoardQuery() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: fetchGlobalBoardApi,
    staleTime: 30_000,
  });

  const patchCache = useCallback(
    (issueId: string, patch: Partial<Issue>) => {
      queryClient.setQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY, (old) =>
        old
          ? {
              ...old,
              issues: old.issues.map((i) =>
                i.id === issueId ? { ...i, ...patch } : i
              ),
            }
          : old
      );
    },
    [queryClient]
  );

  const invalidate = useCallback(
    (projectId?: string) => {
      void queryClient.invalidateQueries({ queryKey: GLOBAL_BOARD_KEY });
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
    },
    [queryClient]
  );

  // Self-assign on start — claim an unassigned issue moved into in_progress
  // (Account → Preferences), unless the same patch already sets an assignee.
  const startAssignee = useCallback(
    (
      current: Issue | undefined,
      nextStatus: Issue["status"] | undefined,
      patchHasAssignee: boolean
    ): string | null => {
      if (!current || patchHasAssignee) return null;
      return autoAssignOnStart({
        meta: user?.user_metadata,
        currentStatus: current.status,
        currentAssigneeId: current.assignee_id,
        nextStatus,
        userId: user?.id,
      });
    },
    [user]
  );

  const writeIssue = useCallback(
    async (
      issueId: string,
      updates: IssueUpdateInput,
      projectId: string,
      patchHasAssignee: boolean
    ) => {
      const prev = queryClient.getQueryData<GlobalBoardResponse>(GLOBAL_BOARD_KEY);
      const current = prev?.issues.find((i) => i.id === issueId);
      const assignee = startAssignee(current, updates.status, patchHasAssignee);
      const patch = assignee ? { ...updates, assignee_id: assignee } : updates;
      patchCache(issueId, patch as Partial<Issue>);
      try {
        await updateIssueApi(issueId, patch);
        invalidate(projectId);
      } catch (err) {
        if (prev) queryClient.setQueryData(GLOBAL_BOARD_KEY, prev);
        throw err;
      }
    },
    [queryClient, patchCache, invalidate, startAssignee]
  );

  // Inline card edits (status/priority/effort/assignee/due).
  const updateIssue = useCallback(
    (issueId: string, updates: IssueUpdateInput, projectId: string) =>
      writeIssue(issueId, updates, projectId, "assignee_id" in updates),
    [writeIssue]
  );

  // Drag & drop between columns (status change) or reorder (position).
  const moveIssue = useCallback(
    (
      issueId: string,
      patch: { status?: Issue["status"]; position: number },
      projectId: string
    ) => writeIssue(issueId, patch, projectId, false),
    [writeIssue]
  );

  const setCategories = useCallback(
    async (issueId: string, categoryIds: string[], projectId: string) => {
      patchCache(issueId, { category_ids: categoryIds });
      try {
        await setIssueCategoriesApi(issueId, categoryIds);
        invalidate(projectId);
      } catch (err) {
        toast.error((err as Error).message);
        invalidate(projectId);
      }
    },
    [patchCache, invalidate]
  );

  const deleteIssue = useCallback(
    async (issueId: string, projectId: string) => {
      await deleteIssueApi(issueId);
      invalidate(projectId);
    },
    [invalidate]
  );

  const createIssue = useCallback(
    async (projectId: string, input: CreateIssueInput) => {
      const issue = await createIssueApi(projectId, input);
      invalidate(projectId);
      return issue;
    },
    [invalidate]
  );

  return {
    issues: (data?.issues ?? []) as Issue[],
    membersByProject: data?.members ?? {},
    categoriesByProject: data?.categories ?? {},
    objectivesByProject: data?.objectives ?? {},
    loading: isLoading,
    updateIssue,
    moveIssue,
    setCategories,
    deleteIssue,
    createIssue,
  };
}
