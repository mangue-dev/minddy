"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStatsApi } from "./stats-api";
import { statsKey } from "./query-keys";

/** IANA zone of the browser (e.g. "Europe/Paris"), to bucket the heatmap. */
export function statsTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Personal statistics of the current user (MIN-12). */
export function useStatsQuery() {
  const tz = statsTimeZone();
  const { data, isPending } = useQuery({
    queryKey: statsKey(tz),
    queryFn: () => fetchStatsApi(tz),
  });
  return { stats: data, loading: isPending };
}
