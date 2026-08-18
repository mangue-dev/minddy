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
  loading: boolean;
  error: Error | null;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  updateProject: (id: string, updates: ProjectUpdateInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  refetch: () => void;
}

/**
 * Source of truth for the project list (mounted once via ProjectsProvider).
 * Cross-client freshness comes from the central realtime bridge
 * (lib/realtime-provider.tsx) invalidating ["projects"].
 */
export function useProjectsQuery(): UseProjectsResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const enabled = !!userId;
  const { data, isPending, error } = useQuery({
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

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });
  }, [queryClient]);

  // Memoized (MIN-315): this result is spread across the value of
  // `ProjectsContext`, a new literal each time it was rendered made it new too,
  // and with it everything that comes down from it — even the cards on the board. `EMPTY`
  // rather than an inline `?? []`, for the same reason: the fallback table must
  // keep your identity as long as there is no data.
  return useMemo(
    () => ({
      projects: data ?? EMPTY,
      loading: enabled && isPending,
      error: error as Error | null,
      createProject,
      updateProject,
      deleteProject,
      refetch,
    }),
    [
      data,
      enabled,
      isPending,
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
