"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createObjectiveApi,
  deleteObjectiveApi,
  fetchObjectivesApi,
  updateObjectiveApi,
} from "./objectives-api";
import { statusCompletionCredit } from "./cycle";
import type { IssueStatus } from "./issue-constants";
import type {
  CreateObjectiveInput,
  Objective,
  ObjectiveUpdateInput,
} from "./types";

const objectivesKey = (projectId: string) => ["objectives", projectId] as const;

export function useObjectivesQuery(projectId: string | null) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: objectivesKey(projectId ?? ""),
    queryFn: () => fetchObjectivesApi(projectId as string),
    enabled: !!projectId,
  });

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

/**
 * Auto progress from linked issues. `done`/`total` stay raw counts (fully-done
 * issues over all linked), but `percent` — the fill of the progress bar — is
 * graded granularly like the cycle's progression ring: issues in progress and
 * in review earn partial credit instead of counting for nothing until "done"
 * (statusCompletionCredit). Count-based (not effort-weighted) so the bar reads
 * in the same units as the done/total label.
 */
export function objectiveProgress(
  objectiveId: string,
  issues: { objective_id: string | null; status: string }[]
): { done: number; total: number; percent: number } {
  const linked = issues.filter((i) => i.objective_id === objectiveId);
  const total = linked.length;
  const done = linked.filter((i) => i.status === "done").length;
  const earned = linked.reduce(
    (sum, i) => sum + statusCompletionCredit(i.status as IssueStatus),
    0
  );
  const percent = total === 0 ? 0 : Math.round((earned / total) * 100);
  return { done, total, percent };
}
