"use client";

import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { appTabRoute } from "./app-tab-location";
import { APP_TAB_METADATA_BATCH_SIZE, appTabMetadataLocations, type AppTabMetadata } from "./app-tab-metadata";
import type { PullRequestRef } from "./agent-api";
import { fetchRoutinesApi } from "./routines-api";

const empty: AppTabMetadata = { pages: [], objectives: [], pullRequests: [], routines: [] };

async function fetchMetadata(hrefs: string[], signal: AbortSignal): Promise<AppTabMetadata> {
  const result: AppTabMetadata = { pages: [], objectives: [], pullRequests: [], routines: [] };
  // Large restored sessions use bounded reads instead of one request per tab.
  for (let offset = 0; offset < hrefs.length; offset += APP_TAB_METADATA_BATCH_SIZE) {
    const response = await fetch("/api/me/app-tabs/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hrefs: hrefs.slice(offset, offset + APP_TAB_METADATA_BATCH_SIZE) }),
      signal,
    });
    if (!response.ok) throw new Error("Application tab labels could not be loaded");
    const data = await response.json() as AppTabMetadata;
    result.pages.push(...data.pages);
    result.objectives.push(...data.objectives);
    result.pullRequests.push(...data.pullRequests);
    result.routines.push(...data.routines);
  }
  return result;
}

/** Labels read narrow metadata plus existing live caches, without starting full reads. */
export function useAppTabMetadata(hrefs: string[]) {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = JSON.stringify(appTabMetadataLocations(hrefs));
  const locations = useMemo(() => JSON.parse(key) as string[], [key]);
  const { data = empty, dataUpdatedAt: metadataUpdatedAt } = useQuery({
    queryKey: ["app-tab-metadata", user?.id, locations],
    queryFn: ({ signal }) => fetchMetadata(locations, signal),
    enabled: !!user && locations.length > 0,
    staleTime: 30_000,
    gcTime: 60_000,
  });
  const routes = useMemo(() => locations.map(appTabRoute), [locations]);
  const pageProjects = useMemo(() => [...new Set(routes.filter((route) => route.pageId).map((route) => route.projectId!))], [routes]);
  const objectiveProjects = useMemo(() => [...new Set(routes.filter((route) => route.objectiveId).map((route) => route.projectId!))], [routes]);
  const prIds = useMemo(() => [...new Set(routes.map((route) => route.prId).filter((id): id is string => !!id))], [routes]);
  const pageQueries = useQueries({ queries: pageProjects.map((projectId) => ({
    queryKey: ["pages", projectId], enabled: false,
    select: (pages: AppTabMetadata["pages"]) => pages.filter((page) => routes.some((route) => route.pageId === page.id)).map(({ id, project_id, title, icon }) => ({ id, project_id, title, icon })),
  })) });
  const objectiveQueries = useQueries({ queries: objectiveProjects.map((projectId) => ({
    queryKey: ["objectives", projectId], enabled: false,
    select: (objectives: AppTabMetadata["objectives"]) => objectives.filter((objective) => routes.some((route) => route.objectiveId === objective.id)).map(({ id, project_id, name, color }) => ({ id, project_id, name, color })),
  })) });
  const prQueries = useQueries({ queries: prIds.map((prId) => ({
    queryKey: ["pull-request", prId], enabled: false,
    select: (detail: { pr?: PullRequestRef | null }) => detail.pr ? { id: prId, number: detail.pr.number, title: detail.pr.title ?? null } : null,
  })) });
  // Same key as the Routines surface: reuse its cache without fetching.
  // The real fetcher is still required — TanStack rejects a queryFn-less
  // observer even when disabled.
  const routines = useQuery({
    queryKey: ["routines"], queryFn: fetchRoutinesApi, enabled: false,
    select: (result: { routines: AppTabMetadata["routines"] }) => result.routines.filter((routine) => routes.some((route) => route.routineId === routine.id)).map(({ id, title }) => ({ id, title })),
  });
  const pageById = new Map(data.pages.map((page) => [page.id, page]));
  const objectiveById = new Map(data.objectives.map((objective) => [objective.id, objective]));
  const prById = new Map(data.pullRequests.map((pr) => [pr.id, pr]));
  const routineById = new Map(data.routines.map((routine) => [routine.id, routine]));
  // A loaded project list is authoritative, including removals and optimistic renames.
  // Once invalidated, it yields to a newer successful metadata read. Failures
  // retain its previous label instead of replacing it with a generic section.
  const superseded = (queryKey: readonly unknown[]) => {
    const cached = client.getQueryState(queryKey);
    return cached?.isInvalidated && metadataUpdatedAt > cached.dataUpdatedAt;
  };
  pageQueries.forEach((query, index) => {
    if (!query.data || superseded(["pages", pageProjects[index]])) return;
    for (const [id, page] of pageById) if (page.project_id === pageProjects[index]) pageById.delete(id);
    for (const page of query.data) pageById.set(page.id, page);
  });
  objectiveQueries.forEach((query, index) => {
    if (!query.data || superseded(["objectives", objectiveProjects[index]])) return;
    for (const [id, objective] of objectiveById) if (objective.project_id === objectiveProjects[index]) objectiveById.delete(id);
    for (const objective of query.data) objectiveById.set(objective.id, objective);
  });
  prQueries.forEach((query, index) => {
    if (superseded(["pull-request", prIds[index]])) return;
    if (query.data === null) prById.delete(prIds[index]);
    else if (query.data) prById.set(query.data.id, query.data);
  });
  if (routines.data && !superseded(["routines"])) {
    routineById.clear();
    for (const routine of routines.data) routineById.set(routine.id, routine);
  }
  return { pageById, objectiveById, prById, routineById };
}
