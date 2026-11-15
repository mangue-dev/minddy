"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { useAuth } from "./auth-context";
import {
  emptyTrashApi,
  fetchTrashApi,
  purgeTrashItemApi,
  restoreTrashItemApi,
  type TrashItem,
  type TrashType,
} from "./trash-api";
import { ALL_STATS_KEY, GLOBAL_BOARD_KEY, HOME_SUMMARY_KEY, PROJECTS_KEY, SEARCH_INDEX_KEY, TRIAGE_COUNTS_KEY, issuesKey, objectivesKey } from "./query-keys";

const TRASH_KEY = ["me", "trash"] as const;

export interface UseTrashResult {
  items: TrashItem[];
  /** Retention days announced by the server (30 by default). */
  retentionDays: number;
  loading: boolean;
  error: Error | null;
  restore: (item: TrashItem) => Promise<void>;
  purge: (item: TrashItem) => Promise<void>;
  empty: () => Promise<void>;
}

/**
 * The trash (MIN-133).
 *
 * Restore brings back content that ALL screens believe is missing: the
 * project board, the cross-project board, the palette index, the home summary, the
 * sorting counters, the view feedback. No realtime event will tell —
 * these are `update` on a line that the client no longer has in cache, and nothing
 * would attach them to a screen that ignores it. Hence the broad invalidation, here,
 * just after the response.
 */
export function useTrashQuery(): UseTrashResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const enabled = !!user?.id;
  const { data, isPending, error } = useQuery({
    queryKey: TRASH_KEY,
    queryFn: fetchTrashApi,
    enabled,
  });

  const invalidate = useCallback(
    async (item: TrashItem | null) => {
      const keys: QueryKey[] = [
        TRASH_KEY,
        PROJECTS_KEY,
        GLOBAL_BOARD_KEY,
        // The routines live in their own list, outside the project (MIN-201).
        ["routines"],
      ];
      if (item?.project_id) {
        keys.push(
          issuesKey(item.project_id),
          objectivesKey(item.project_id),
          // The wiki tree: restoring a page brings back a whole sub-tree,
          // that no realtime event would signal (MIN-266).
          ["pages", item.project_id],
          ["feedback", item.project_id]
        );
      }
      keys.push(
        HOME_SUMMARY_KEY,
        TRIAGE_COUNTS_KEY,
        SEARCH_INDEX_KEY,
        ALL_STATS_KEY
      );
      await Promise.all(
        keys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
      );
    },
    [queryClient]
  );

  const restore = useCallback(
    async (item: TrashItem) => {
      await restoreTrashItemApi(item.type, item.id);
      await invalidate(item);
    },
    [invalidate]
  );

  const purge = useCallback(
    async (item: TrashItem) => {
      await purgeTrashItemApi(item.type, item.id);
      await invalidate(null);
    },
    [invalidate]
  );

  const empty = useCallback(async () => {
    await emptyTrashApi();
    await invalidate(null);
  }, [invalidate]);

  return {
    items: data?.items ?? [],
    retentionDays: data?.retention_days ?? 30,
    loading: enabled && isPending,
    error: error as Error | null,
    restore,
    purge,
    empty,
  };
}

/** Days remaining before automatic purge. Never negative on screen. */
export function daysLeft(deletedAt: string, retentionDays: number): number {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(retentionDays - elapsed));
}

/** Order of display of sections: content first, containing then. */
export const TRASH_TYPE_ORDER: TrashType[] = [
  "issue",
  "objective",
  "page",
  "feedback",
  "routine",
  "project",
];
