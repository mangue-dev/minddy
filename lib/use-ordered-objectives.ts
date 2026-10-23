"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNow } from "next-intl";
import { issuesQueryFn } from "./issues-api";
import { orderObjectives } from "./objective-order";
import type { Issue, Objective } from "./types";

const NO_ISSUES: Issue[] = [];

// Module-level so TanStack Query keeps the combined array while the lists are
// unchanged; an inline function would rebuild it on every render.
const combineIssueLists = (results: { data?: unknown }[]): Issue[] =>
  results.flatMap((result) => (result.data as Issue[] | undefined) ?? NO_ISSUES);

/**
 * Objectives in picker order (lib/objective-order.ts), counted against the
 * tickets of their projects.
 *
 * The tickets come from the `["issues", projectId]` cache the board already
 * fills and the realtime bridge keeps current. A picker mounted where that
 * cache is cold loads it once; `staleTime: Infinity` keeps a picker that opens
 * from refetching a list this observer did not need to be fresher.
 */
export function useOrderedObjectives<T extends Objective>(objectives: readonly T[]): T[] {
  const projectIds = useMemo(
    () => [...new Set(objectives.map((objective) => objective.project_id))].sort(),
    [objectives]
  );
  const issues = useQueries({
    queries: projectIds.map((projectId) => ({
      queryKey: ["issues", projectId],
      queryFn: issuesQueryFn(projectId),
      staleTime: Infinity,
    })),
    combine: combineIssueLists,
  });
  const now = useNow().getTime();
  return useMemo(() => orderObjectives(objectives, issues, now), [objectives, issues, now]);
}
