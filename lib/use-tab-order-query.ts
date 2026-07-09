"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTabOrderApi, saveTabOrderApi } from "./tab-order-api";

/**
 * The per-user tab-strip order for one board scope (MIN-34), DB-backed via
 * /api/me/tab-order. `setOrder` is optimistic: it patches the cache instantly
 * (so the drag reorder feels immediate), persists, and reverts on failure —
 * the same pattern as `moveIssue`.
 */
export function useTabOrderQuery(scope: string) {
  const queryClient = useQueryClient();
  const queryKey = ["tab-order", scope];

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchTabOrderApi(scope),
  });

  const setOrder = useCallback(
    async (keys: string[]) => {
      const previous = queryClient.getQueryData<string[] | null>(queryKey);
      queryClient.setQueryData<string[] | null>(queryKey, keys);
      try {
        await saveTabOrderApi(scope, keys);
      } catch (err) {
        queryClient.setQueryData<string[] | null>(queryKey, previous ?? null);
        throw err;
      }
    },
    // queryKey is derived from scope; listing scope keeps the deps stable.
    [queryClient, scope] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { order: (data ?? null) as string[] | null, setOrder };
}
