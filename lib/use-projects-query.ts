"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "./auth-context";
import {
  createProjectApi,
  deleteProjectApi,
  fetchProjectsApi,
  updateProjectApi,
} from "./projects-api";
import type { CreateProjectInput, Project, ProjectUpdateInput } from "./types";

const PROJECTS_KEY = ["projects"] as const;

export interface UseProjectsResult {
  projects: Project[];
  /**
   * The cache holds a list — even a stale one. A refetch that fails must not
   * read as "no projects"; the provider uses it to keep the app running on
   * its cached list instead of swapping it for the unavailable screen.
   */
  hasData: boolean;
  /**
   * The list is not known yet: the first read is in flight, or the session it
   * depends on is still being restored. An empty list while this holds means
   * "not read yet", never "no projects" (MIN-937).
   */
  loading: boolean;
  /** A read of the list is in flight, the first one or a refresh. */
  fetching: boolean;
  error: Error | null;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: string, updates: ProjectUpdateInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  /** Reads the list again; resolves once that read has settled. */
  refetch: () => Promise<void>;
}

/**
 * Source of truth for the project list (mounted once via ProjectsProvider).
 * Cross-client freshness comes from the central realtime bridge
 * (lib/realtime-provider.tsx) invalidating ["projects"].
 */
export function useProjectsQuery(): UseProjectsResult {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const enabled = !!userId;
  const { data, isPending, isFetching, error } = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: fetchProjectsApi,
    enabled,
  });

  const createProject = useCallback(
    async (input: CreateProjectInput) => {
      const project = await createProjectApi(input);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      return project;
    },
    [queryClient]
  );

  const updateProject = useCallback(
    async (id: string, updates: ProjectUpdateInput) => {
      const project = await updateProjectApi(id, updates);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
      return project;
    },
    [queryClient]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await deleteProjectApi(id);
      await queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
    [queryClient]
  );

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
    [queryClient]
  );

  // Memoized (MIN-315): this result is spread across the value of
  // `ProjectsContext`, a new literal each time it was rendered made it new too,
  // and with it everything that comes down from it — even the cards on the board. `EMPTY`
  // rather than an inline `?? []`, for the same reason: the fallback table must
  // keep your identity as long as there is no data.
  return useMemo(
    () => ({
      projects: data ?? EMPTY,
      hasData: data !== undefined,
      // The query stays disabled until the session is known: counting only
      // `enabled` left a window where the list read as empty and every
      // project screen said "Project not found" (MIN-937).
      loading: isPending && (enabled || authLoading),
      fetching: isFetching,
      error: error as Error | null,
      createProject,
      updateProject,
      deleteProject,
      refetch,
    }),
    [
      data,
      enabled,
      authLoading,
      isPending,
      isFetching,
      error,
      createProject,
      updateProject,
      deleteProject,
      refetch,
    ]
  );
}

/** The fallback table, stable — cf. the `useMemo` above. */
const EMPTY: Project[] = [];
