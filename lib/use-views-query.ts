"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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

  const { data, isLoading } = useQuery({
    queryKey: viewsKey(projectId ?? ""),
    queryFn: () => fetchViewsApi(projectId as string),
    enabled: !!projectId,
  });

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
