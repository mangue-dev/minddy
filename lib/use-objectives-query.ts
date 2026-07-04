"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useId } from "react";
import { getSupabase } from "./supabase";
import {
  createObjectiveApi,
  deleteObjectiveApi,
  fetchObjectivesApi,
  updateObjectiveApi,
} from "./objectives-api";
import type {
  CreateObjectiveInput,
  Objective,
  ObjectiveUpdateInput,
} from "./types";

const objectivesKey = (projectId: string) => ["objectives", projectId] as const;

export function useObjectivesQuery(projectId: string | null) {
  const queryClient = useQueryClient();
  const channelId = useId();

  const { data, isLoading } = useQuery({
    queryKey: objectivesKey(projectId ?? ""),
    queryFn: () => fetchObjectivesApi(projectId as string),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (!projectId) return;
    const supabase = getSupabase();
    const channel = supabase
      .channel(`objectives:${projectId}:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "objectives",
          filter: `project_id=eq.${projectId}`,
        },
        () =>
          void queryClient.invalidateQueries({ queryKey: objectivesKey(projectId) })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, projectId, channelId]);

  const invalidate = useCallback(() => {
    if (projectId) {
      void queryClient.invalidateQueries({ queryKey: objectivesKey(projectId) });
    }
  }, [queryClient, projectId]);

  const createObjective = useCallback(
    async (input: CreateObjectiveInput) => {
      const objective = await createObjectiveApi(projectId as string, input);
      invalidate();
      return objective;
    },
    [projectId, invalidate]
  );

  const updateObjective = useCallback(
    async (objectiveId: string, updates: ObjectiveUpdateInput) => {
      const objective = await updateObjectiveApi(objectiveId, updates);
      invalidate();
      return objective;
    },
    [invalidate]
  );

  const deleteObjective = useCallback(
    async (objectiveId: string) => {
      await deleteObjectiveApi(objectiveId);
      invalidate();
      // Detached issues lose their objective_id → refresh the board too.
      if (projectId) {
        void queryClient.invalidateQueries({ queryKey: ["issues", projectId] });
      }
    },
    [invalidate, projectId, queryClient]
  );

  return {
    objectives: (data ?? []) as Objective[],
    loading: isLoading,
    createObjective,
    updateObjective,
    deleteObjective,
  };
}

/** Auto progress from linked issues: done / total (plan §6). */
export function objectiveProgress(
  objectiveId: string,
  issues: { objective_id: string | null; status: string }[]
): { done: number; total: number; percent: number } {
  const linked = issues.filter((i) => i.objective_id === objectiveId);
  const total = linked.length;
  const done = linked.filter((i) => i.status === "done").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { done, total, percent };
}
