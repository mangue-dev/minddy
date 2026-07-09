"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createViewApi,
  deleteViewApi,
  fetchViewsApi,
  updateViewApi,
  type ViewScope,
} from "./views-api";
import type { CreateViewInput, View, ViewUpdateInput } from "./types";

export function useViewsQuery(scope: ViewScope) {
  const queryClient = useQueryClient();
  // The scope object may be re-created every render — key on its content.
  const scopeId = scope.kind === "project" ? scope.projectId : "global";

  const { data, isLoading } = useQuery({
    queryKey: ["views", scopeId],
    queryFn: () => fetchViewsApi(scope),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["views", scopeId] });
  }, [queryClient, scopeId]);

  const createView = useCallback(
    async (input: CreateViewInput) => {
      const view = await createViewApi(
        scopeId === "global" ? { kind: "global" } : { kind: "project", projectId: scopeId },
        input
      );
      invalidate();
      return view;
    },
    [scopeId, invalidate]
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

export type { ViewScope };
