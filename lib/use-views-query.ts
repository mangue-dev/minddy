"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import {
  createViewApi,
  deleteViewApi,
  fetchViewsApi,
  updateViewApi,
} from "./views-api";
import type { CreateViewInput, View, ViewUpdateInput } from "./types";

const viewsKey = (projectId: string) => ["views", projectId] as const;

export function useViewsQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: viewsKey(projectId ?? ""),
    queryFn: () => fetchViewsApi(projectId as string),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`views:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "views",
          filter: `project_id=eq.${projectId}`,
        },
        () => void queryClient.invalidateQueries({ queryKey: viewsKey(projectId) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, projectId, channelId]);

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: viewsKey(projectId) });
    }
  }, [queryClient, projectId]);

  const createView = useCallback(
    async (input: CreateViewInput) => {
      const view = await createViewApi(projectId as string, input);
      invalidate();
      return view;
    },
    [projectId, invalidate]
  );

  const updateView = useCallback(
    async (viewId: string, updates: ViewUpdateInput) => {
      const view = await updateViewApi(viewId, updates);
      invalidate();
      return view;
    },
    [invalidate]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      await deleteViewApi(viewId);
      invalidate();
    },
    [invalidate]
  );

  return {
    views: (data ?? []) as View[],
    loading: isLoading,
    createView,
    updateView,
    deleteView,
  };
}
