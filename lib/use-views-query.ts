"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

  const { data, isPending } = useQuery({
    queryKey: ["views", scopeId],
    queryFn: ({ signal }) => fetchViewsApi(scope, signal),
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

  const updateMutation = useMutation({
    mutationKey: ["update-view", scopeId],
    mutationFn: ({ viewId, updates }: { viewId: string; updates: ViewUpdateInput }) =>
      updateViewApi(viewId, updates),
    onMutate: async ({ viewId, updates }) => {
      const queryKey = ["views", scopeId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<View[]>(queryKey)?.find((view) => view.id === viewId);
      const optimistic = previous ? { ...previous, ...updates } : undefined;
      if (optimistic) {
        queryClient.setQueryData<View[]>(queryKey, (views) =>
          views?.map((view) => view.id === viewId ? optimistic : view),
        );
      }
      // React Query structurally shares data; capture the actual cached object.
      return { previous, optimistic: queryClient.getQueryData<View[]>(queryKey)?.find((view) => view.id === viewId) };
    },
    onSuccess: (confirmed, _variables, context) => {
      queryClient.setQueryData<View[]>(["views", scopeId], (views) =>
        views?.map((view) => view === context?.optimistic ? confirmed : view),
      );
    },
    onError: (_error, _variables, context) => {
      if (!context?.previous) return;
      const previous = context.previous;
      queryClient.setQueryData<View[]>(["views", scopeId], (views) =>
        views?.map((view) => view === context.optimistic ? previous : view),
      );
    },
    onSettled: () => {
      // Wait for other writes in this scope before a refetch can replace them.
      if (queryClient.isMutating({ mutationKey: ["update-view", scopeId] }) === 1) invalidate();
    },
  });
  const updateView = useCallback(
    (viewId: string, updates: ViewUpdateInput) => updateMutation.mutateAsync({ viewId, updates }),
    [updateMutation.mutateAsync],
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
    loading: isPending,
    createView,
    updateView,
    deleteView,
  };
}

export type { ViewScope };
