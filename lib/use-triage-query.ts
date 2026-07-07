"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import { acceptTriageItemApi, fetchTriageItemsApi, rejectTriageItemApi } from "./triage-api";
import type { CreateIssueInput, TriageItem } from "./types";

const triageKey = (projectId: string) => ["triage", projectId] as const;

/**
 * Pending triage items of a project (the arrival zone, plan §8). The list is
 * pending-only, so `count` doubles as the sidebar counter. Shared cache key
 * between the triage page and the sidebar — one fetch, one realtime bridge.
 */
export function useTriageQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: triageKey(projectId ?? ""),
    queryFn: () => fetchTriageItemsApi(projectId as string),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`triage:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "triage_items",
          filter: `project_id=eq.${projectId}`,
        },
        () =>
          void queryClient.invalidateQueries({ queryKey: triageKey(projectId) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, projectId, channelId]);

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: triageKey(projectId) });
    }
  }, [queryClient, projectId]);

  const acceptItem = useCallback(
    async (itemId: string, input: CreateIssueInput) => {
      const issue = await acceptTriageItemApi(itemId, input);
      invalidate();
      // The accepted item just became an issue → refresh the board too.
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
      return issue;
    },
    [invalidate, projectId, queryClient]
  );

  const rejectItem = useCallback(
    async (itemId: string) => {
      await rejectTriageItemApi(itemId);
      invalidate();
    },
    [invalidate]
  );

  const items = (data ?? []) as TriageItem[];
  return {
    items,
    count: items.length,
    loading: isLoading,
    acceptItem,
    rejectItem,
  };
}
