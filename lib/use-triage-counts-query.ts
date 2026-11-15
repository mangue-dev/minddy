"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectTriageCount, TriageCountsResponse } from "./types";
import { fetchSeeded } from "./server-seed";
import { TRIAGE_COUNTS_KEY } from "./query-keys";

/** Stable identity: without it, each rendering would render a new table and
 would restart the sidebar memos that depend on it. */
const NO_COUNTS: Record<string, ProjectTriageCount> = {};

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
 * Freshness: the realtime bridge invalidates this key on every ticket,
 * feedback, project and membership event (lib/realtime-keys.ts), which covers
 * everything that can move it, scope included. No staleTime, therefore.
 */
export function useTriageCountsQuery() {
  const { data } = useQuery({
    queryKey: TRIAGE_COUNTS_KEY,
    queryFn: async (): Promise<TriageCountsResponse> => {
      const response = await fetchSeeded("/api/me/triage-counts");
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

/**
 * Home's total (MIN-695): the sum of the badges on Home's project rows, so
 * every control going back to Home shows exactly what Home will show.
 */
export function triageCountTotalAcross(
  projects: ReadonlyArray<{ id: string }>,
  counts: Record<string, ProjectTriageCount>,
): number {
  return projects.reduce((sum, project) => sum + triageCountTotal(counts[project.id]), 0);
}
