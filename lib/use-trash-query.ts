"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "./auth-context";
import {
  emptyTrashApi,
  fetchTrashApi,
  purgeTrashItemApi,
  restoreTrashItemApi,
  type TrashItem,
  type TrashType,
} from "./trash-api";

const TRASH_KEY = ["me", "trash"] as const;

export interface UseTrashResult {
  items: TrashItem[];
  /** Jours de conservation annoncés par le serveur (30 par défaut). */
  retentionDays: number;
  loading: boolean;
  error: Error | null;
  restore: (item: TrashItem) => Promise<void>;
  purge: (item: TrashItem) => Promise<void>;
  empty: () => Promise<void>;
}

/**
 * La corbeille (MIN-133).
 *
 * Restaurer ramène du contenu que TOUS les écrans croient absent : le board du
 * projet, le board cross-projet, l'index de la palette, le résumé d'accueil, les
 * compteurs de triage, la vue feedback. Aucun événement realtime ne le dira —
 * ce sont des `update` sur une ligne que le client n'a plus en cache, et rien ne
 * les rattacherait à un écran qui l'ignore. D'où l'invalidation large, ici,
 * juste après la réponse.
 */
export function useTrashQuery(): UseTrashResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: TRASH_KEY,
    queryFn: fetchTrashApi,
    enabled: !!user?.id,
  });

  const invalidate = useCallback(
    async (item: TrashItem | null) => {
      const keys: unknown[][] = [[...TRASH_KEY], ["projects"], ["me", "board"]];
      if (item?.project_id) {
        keys.push(
          ["issues", item.project_id],
          ["objectives", item.project_id],
          ["feedback", item.project_id],
          ["feedback-count", item.project_id]
        );
      }
      keys.push(
        ["me", "summary"],
        ["me", "triage-counts"],
        ["me", "search-index"],
        ["stats"]
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
    loading: isLoading,
    error: error as Error | null,
    restore,
    purge,
    empty,
  };
}

/** Jours restants avant la purge automatique. Jamais négatif à l'écran. */
export function daysLeft(deletedAt: string, retentionDays: number): number {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(retentionDays - elapsed));
}

/** Ordre d'affichage des sections : le contenu d'abord, le contenant ensuite. */
export const TRASH_TYPE_ORDER: TrashType[] = [
  "issue",
  "objective",
  "feedback",
  "project",
];
