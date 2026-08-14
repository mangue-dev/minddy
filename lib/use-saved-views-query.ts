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
 * Mes vues enregistrées (la palette de commandes). Elles vivent en base pour
 * suivre le compte d'un appareil à l'autre ; la liste est courte et ne change
 * qu'à la main, donc une simple invalidation après écriture suffit — pas de
 * temps réel.
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
