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

  // Mémoïsé (MIN-315) : ce résultat est étalé dans la value de
  // `ProjectsContext`, un littéral neuf à chaque rendu la rendait neuve aussi,
  // et avec elle tout ce qui en descend — jusqu'aux cartes du board. `EMPTY`
  // plutôt qu'un `?? []` inline, pour la même raison : le tableau de repli doit
  // garder son identité tant qu'il n'y a pas de données.
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

/** Le tableau de repli, stable — cf. le `useMemo` ci-dessus. */
const EMPTY: Project[] = [];
