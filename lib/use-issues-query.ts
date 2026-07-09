"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { toast } from "mangue-ui";
import {
  createIssueApi,
  deleteIssueApi,
  fetchIssuesApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import { useAuth } from "./auth-context";
import { autoAssignOnStart } from "./auto-assign-on-start";
import type { CreateIssueInput, Issue, IssueUpdateInput } from "./types";

const issuesKey = (projectId: string) => ["issues", projectId] as const;

// Freshness across clients (Numo, MCP, other members) comes from the central
// realtime bridge (lib/realtime-provider.tsx) invalidating ["issues", projectId].
export function useIssuesQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Per-issue debounce for category writes (see setCategories).
  const catTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const catLatest = useRef(new Map<string, string[]>());

  const { data, isLoading, error } = useQuery({
    queryKey: issuesKey(projectId ?? ""),
    queryFn: () => fetchIssuesApi(projectId as string),
    enabled: !!projectId,
  });

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: issuesKey(projectId) });
    }
  }, [queryClient, projectId]);

  // Self-assign on start (Account → Preferences): when a status change moves an
  // unassigned issue into in_progress, claim it for the current user. Returns
  // the id to assign, or null to leave the assignee alone — a no-op unless it's
  // a genuine transition of an unassigned issue and the caller isn't already
  // setting the assignee in the same patch. Covers every status-changing path:
  // drag & drop (moveIssue), the status pickers, triage, and Shift+P copyPrompt.
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

  const createIssue = useCallback(
    async (input: CreateIssueInput) => {
      const issue = await createIssueApi(projectId as string, input);
      invalidate();
      return issue;
    },
    [projectId, invalidate]
  );

  // Optimistic: patch the cache immediately so edits (incl. inline card pickers)
  // feel instant; persist, reconcile via invalidate, and revert on failure.
  const updateIssue = useCallback(
    async (issueId: string, updates: IssueUpdateInput) => {
      const key = projectId ? issuesKey(projectId) : null;
      const previous = key ? queryClient.getQueryData<Issue[]>(key) : undefined;
      const assignee = startAssignee(
        previous?.find((i) => i.id === issueId),
        updates.status,
        "assignee_id" in updates
      );
      const patch = assignee ? { ...updates, assignee_id: assignee } : updates;
      if (key) {
        queryClient.setQueryData<Issue[]>(key, (old) =>
          (old ?? []).map((i) => (i.id === issueId ? { ...i, ...patch } : i))
        );
      }
      try {
        const issue = await updateIssueApi(issueId, patch);
        invalidate();
        return issue;
      } catch (err) {
        if (key) queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, invalidate, startAssignee]
  );

  const deleteIssue = useCallback(
    async (issueId: string) => {
      await deleteIssueApi(issueId);
      invalidate();
    },
    [invalidate]
  );

  /**
   * Optimistic move for drag & drop: patch the cache immediately (so the card
   * jumps instantly), persist, and revert on failure. Realtime reconciles the
   * final state across clients.
   */
  const moveIssue = useCallback(
    async (
      issueId: string,
      patch: { status?: Issue["status"]; position: number }
    ) => {
      if (!projectId) return;
      const key = issuesKey(projectId);
      const previous = queryClient.getQueryData<Issue[]>(key);
      const assignee = startAssignee(
        previous?.find((i) => i.id === issueId),
        patch.status,
        false
      );
      const write = assignee ? { ...patch, assignee_id: assignee } : patch;
      queryClient.setQueryData<Issue[]>(key, (old) =>
        (old ?? []).map((i) => (i.id === issueId ? { ...i, ...write } : i))
      );
      try {
        await updateIssueApi(issueId, write);
      } catch (err) {
        queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, startAssignee]
  );

  // Optimistic + DEBOUNCED per issue: rapid category toggles patch the cache
  // instantly but coalesce into a single PUT with the final set. Firing a PUT
  // per toggle raced on the join table (concurrent delete-then-insert →
  // duplicate-key 500 + UI stutter). Errors are surfaced here, then the cache is
  // reconciled from the server.
  const setCategories = useCallback(
    async (issueId: string, categoryIds: string[]) => {
      const key = projectId ? issuesKey(projectId) : null;
      if (key) {
        queryClient.setQueryData<Issue[]>(key, (old) =>
          (old ?? []).map((i) =>
            i.id === issueId ? { ...i, category_ids: categoryIds } : i
          )
        );
      }
      catLatest.current.set(issueId, categoryIds);
      const pending = catTimers.current.get(issueId);
      if (pending) clearTimeout(pending);
      catTimers.current.set(
        issueId,
        setTimeout(() => {
          catTimers.current.delete(issueId);
          const ids = catLatest.current.get(issueId) ?? categoryIds;
          catLatest.current.delete(issueId);
          setIssueCategoriesApi(issueId, ids)
            .then(() => invalidate())
            .catch((err) => {
              toast.error((err as Error).message);
              invalidate();
            });
        }, 300)
      );
    },
    [projectId, queryClient, invalidate]
  );

  return {
    issues: (data ?? []) as Issue[],
    loading: isLoading,
    error: error as Error | null,
    createIssue,
    updateIssue,
    deleteIssue,
    moveIssue,
    setCategories,
  };
}
