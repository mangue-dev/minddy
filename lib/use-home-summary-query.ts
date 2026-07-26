"use client";

import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "./global-board-api";
import type { HomeSummaryResponse } from "./types";

/**
 * Charge utile du tableau de bord (MIN-89).
 *
 * L'accueil montait `useGlobalBoardQuery()` — c'est-à-dire GET /api/me/board,
 * tous les tickets complets de tous mes projets — pour afficher trois compteurs
 * et trois lignes de cycle. Cette query lit la même chose depuis
 * GET /api/me/summary, où les compteurs sont des `count` SQL et où seuls les
 * tickets du cycle courant sont matérialisés, en colonnes réduites.
 *
 * Fraîcheur : le pont temps réel invalide `["me","summary"]` sur tout événement
 * de ticket, de cycle ou de feedback (lib/realtime-provider.tsx) — donc pas de
 * staleTime court ici, l'horloge n'a plus rien à rattraper.
 */
export const HOME_SUMMARY_KEY = ["me", "summary"] as const;

async function fetchHomeSummaryApi(): Promise<HomeSummaryResponse> {
  const response = await fetch(
    `/api/me/summary?tz=${encodeURIComponent(browserTimeZone())}`
  );
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as HomeSummaryResponse;
}

export function useHomeSummaryQuery() {
  const { data, isLoading } = useQuery({
    queryKey: HOME_SUMMARY_KEY,
    queryFn: fetchHomeSummaryApi,
  });

  return {
    counts: data?.counts ?? { open: 0, inProgress: 0, mine: 0, total: 0 },
    cycles: data?.cycles ?? null,
    cycleIssues: data?.cycleIssues ?? [],
    relations: data?.relations ?? [],
    blockerStatuses: data?.blockerStatuses ?? {},
    loading: isLoading,
  };
}
