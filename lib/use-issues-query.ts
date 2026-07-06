"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef } from "react";
import { toast } from "mangue-ui";
import { getSupabase } from "./supabase";
import {
  createIssueApi,
  deleteIssueApi,
  fetchIssuesApi,
  updateIssueApi,
} from "./issues-api";
import { setIssueCategoriesApi } from "./categories-api";
import type { CreateIssueInput, Issue, IssueUpdateInput } from "./types";

const issuesKey = (projectId: string) => ["issues", projectId] as const;

export function useIssuesQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

  // Per-issue debounce for category writes (see setCategories).
  const catTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const catLatest = useRef(new Map<string, string[]>());

  const { data, isLoading, error } = useQuery({
    queryKey: issuesKey(projectId ?? ""),
    queryFn: () => fetchIssuesApi(projectId as string),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`issues:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "issues",
          filter: `project_id=eq.${projectId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: issuesKey(projectId) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, projectId, channelId]);

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: issuesKey(projectId) });
    }
  }, [queryClient, projectId]);

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
      if (key) {
        queryClient.setQueryData<Issue[]>(key, (old) =>
          (old ?? []).map((i) => (i.id === issueId ? { ...i, ...updates } : i))
        );
      }
      try {
        const issue = await updateIssueApi(issueId, updates);
        invalidate();
        return issue;
      } catch (err) {
        if (key) queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient, invalidate]
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
      queryClient.setQueryData<Issue[]>(key, (old) =>
        (old ?? []).map((i) => (i.id === issueId ? { ...i, ...patch } : i))
      );
      try {
        await updateIssueApi(issueId, patch);
      } catch (err) {
        queryClient.setQueryData(key, previous);
        throw err;
      }
    },
    [projectId, queryClient]
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
