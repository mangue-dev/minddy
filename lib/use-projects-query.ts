"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
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
 * Source of truth for the project list. Mount ONCE (via ProjectsProvider) so the
 * Realtime bridge isn't duplicated. One channel per table — namespaced by a
 * per-mount id, since `supabase.channel(name)` is a singleton per name.
 */
export function useProjectsQuery(): UseProjectsResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const channelId = useId();

  const { data, isLoading, error } = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: fetchProjectsApi,
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const invalidate = () =>
      void queryClient.invalidateQueries({ queryKey: PROJECTS_KEY });

    const projectsChannel = supabase
      .channel(`projects:${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        invalidate
      )
      .subscribe();

    const membersChannel = supabase
      .channel(`project-members:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "project_members",
          filter: `user_id=eq.${userId}`,
        },
        invalidate
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(projectsChannel);
      void supabase.removeChannel(membersChannel);
    };
  }, [queryClient, userId, channelId]);

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

  return {
    projects: data ?? [],
    loading: isLoading,
    error: error as Error | null,
    createProject,
    updateProject,
    deleteProject,
    refetch,
  };
}
