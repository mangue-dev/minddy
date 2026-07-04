"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import {
  createIssueApi,
  deleteIssueApi,
  fetchIssuesApi,
  updateIssueApi,
} from "./issues-api";
import type { CreateIssueInput, Issue, IssueUpdateInput } from "./types";

const issuesKey = (projectId: string) => ["issues", projectId] as const;

export function useIssuesQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

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

  const updateIssue = useCallback(
    async (issueId: string, updates: IssueUpdateInput) => {
      const issue = await updateIssueApi(issueId, updates);
      invalidate();
      return issue;
    },
    [invalidate]
  );

  const deleteIssue = useCallback(
    async (issueId: string) => {
      await deleteIssueApi(issueId);
      invalidate();
    },
    [invalidate]
  );

  return {
    issues: (data ?? []) as Issue[],
    loading: isLoading,
    error: error as Error | null,
    createIssue,
    updateIssue,
    deleteIssue,
  };
}
