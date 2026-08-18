"use client";

import { useQuery } from "@tanstack/react-query";
import { browserTimeZone } from "./global-board-api";
import type { HomeSummaryResponse } from "./types";

/**
 * Dashboard payload (MIN-89).
 *
 * Home was going up `useGlobalBoardQuery()` — i.e. GET /api/me/board,
 * all full tickets for all my projects — to show three counters
 * and three cycle lines. This query reads the same thing from
 * GET /api/me/summary, where the counters are `count` SQL and where only the
 * tickets of the current cycle are materialized, in reduced columns.
 *
 * Freshness: the real-time bridge is invalid `["me","summary"]` on any event
 * ticket, cycle or feedback (lib/realtime-provider.tsx) — so no
 * staleTime is running here, the clock has nothing left to catch up with.
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
  const { data, isPending } = useQuery({
    queryKey: HOME_SUMMARY_KEY,
    queryFn: fetchHomeSummaryApi,
  });

  return {
    counts: data?.counts ?? { total: 0 },
    cycles: data?.cycles ?? null,
    cycleIssues: data?.cycleIssues ?? [],
    dueSoon: data?.dueSoon ?? [],
    triage: data?.triage ?? [],
    triageTotal: data?.triageTotal ?? 0,
    newFeedback: data?.newFeedback ?? [],
    newFeedbackTotal: data?.newFeedbackTotal ?? 0,
    relations: data?.relations ?? [],
    blockerStatuses: data?.blockerStatuses ?? {},
    loading: isPending,
  };
}
