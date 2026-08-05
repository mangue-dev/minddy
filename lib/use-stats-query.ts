"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStatsApi } from "./stats-api";

/** Fuseau IANA du navigateur (ex. "Europe/Paris"), pour bucketer la heatmap. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Statistiques personnelles de l'utilisateur courant (MIN-12). */
export function useStatsQuery() {
  const tz = browserTimeZone();
  const { data, isPending } = useQuery({
    queryKey: ["stats", tz] as const,
    queryFn: () => fetchStatsApi(tz),
  });
  return { stats: data, loading: isPending };
}
