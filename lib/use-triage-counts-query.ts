"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectTriageCount, TriageCountsResponse } from "./types";

/**
 * What is waiting to be sorted in each of my projects (tickets in sorting +
 * open returns), for the figures carried by the project lines of the
 * sidebar when you are OUTSIDE a project — home, global board, inbox…
 *
 * A route separate and lowercase (GET /api/me/triage-counts) rather than a
 * field of /api/me/summary, for the same reason as the Smart Assign warning: the
 * sidebar is mounted on all pages, the dashboard summary should
 * not be. See lib/use-smart-assign-warnings-query.ts.
 *
 * Freshness: the real-time bridge invalidates this key on any ticket, return and opt-in event (lib/realtime-provider.tsx) — i.e.
 * all that who can move it, perimeter included. No staleTime, therefore.
 */
export const TRIAGE_COUNTS_KEY = ["me", "triage-counts"] as const;

/** Stable identity: without it, each rendering would render a new table and
 would restart the sidebar memos that depend on it. */
const NO_COUNTS: Record<string, ProjectTriageCount> = {};

export function useTriageCountsQuery() {
  const { data } = useQuery({
    queryKey: TRIAGE_COUNTS_KEY,
    queryFn: async (): Promise<TriageCountsResponse> => {
      const response = await fetch("/api/me/triage-counts");
      if (!response.ok) return { counts: {} };
      return (await response.json()) as TriageCountsResponse;
    },
  });

  return { counts: data?.counts ?? NO_COUNTS };
}

/** The number displayed: the two halves of the line make up one badge. */
export function triageCountTotal(count: ProjectTriageCount | undefined): number {
  return count ? count.triage + count.feedback : 0;
}
