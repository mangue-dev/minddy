"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchStatsApi } from "./stats-api";

/** IANA zone of the browser (e.g. "Europe/Paris"), to bucket the heatmap. */
function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Personal statistics of the current user (MIN-12). */
export function useStatsQuery() {
  const tz = browserTimeZone();
  const { data, isPending } = useQuery({
    queryKey: ["stats", tz] as const,
    queryFn: () => fetchStatsApi(tz),
  });
  return { stats: data, loading: isPending };
}
