"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSavedViewApi,
  deleteSavedViewApi,
  fetchSavedViewsApi,
  updateSavedViewApi,
} from "./saved-views-api";
import type { SavedView } from "./types";

export const savedViewsQueryKey = ["saved-views"] as const;

/**
 * My saved views (the command palette). They live on base to
 * follow the account from one device to another; the list is short and only changes
 * by hand, so a simple invalidation after writing is enough — no
 * real time.
 */
export function useSavedViewsQuery(enabled = true) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: savedViewsQueryKey,
    queryFn: fetchSavedViewsApi,
    enabled,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: savedViewsQueryKey });
  }, [queryClient]);

  const createSavedView = useCallback(
    async (input: { name: string; href: string }) => {
      const view = await createSavedViewApi(input);
      invalidate();
      return view;
    },
    [invalidate]
  );

  const renameSavedView = useCallback(
    async (id: string, name: string) => {
      const view = await updateSavedViewApi(id, { name });
      invalidate();
      return view;
    },
    [invalidate]
  );

  const deleteSavedView = useCallback(
    async (id: string) => {
      await deleteSavedViewApi(id);
      invalidate();
    },
    [invalidate]
  );

  return {
    savedViews: (data ?? []) as SavedView[],
    loading: isPending,
    createSavedView,
    renameSavedView,
    deleteSavedView,
  };
}
