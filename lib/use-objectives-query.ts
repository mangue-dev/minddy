"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createObjectiveApi,
  deleteObjectiveApi,
  fetchObjectivesApi,
  updateObjectiveApi,
} from "./objectives-api";
import { effortToPoints, statusCompletionCredit } from "./cycle";
import type { IssueEffort, IssueStatus } from "./issue-constants";
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
 * Auto progress from linked issues. `done`/`total` stay raw issue counts
 * (fully-done issues over all linked) for the label, but `percent` — the fill
 * of the progress bar — is the sum of finished EFFORT over total effort, in
 * hidden Fibonacci points (effortToPoints, xs1 s2 m3 l5 xl8, unsized = m), the
 * same weighting the cycle's progression ring uses (cycleCompletionPercent):
 * an XL done + an XS left reads 89 %, not 50 %. Work in flight earns partial
 * credit (statusCompletionCredit) instead of counting for nothing until "done".
 */
export function objectiveProgress(
  objectiveId: string,
  issues: { objective_id: string | null; status: string; effort?: IssueEffort | null }[]
): { done: number; total: number; percent: number } {
  const linked = issues.filter((i) => i.objective_id === objectiveId);
  const total = linked.length;
  const done = linked.filter((i) => i.status === "done").length;
  let totalPoints = 0;
  let earnedPoints = 0;
  for (const i of linked) {
    const points = effortToPoints(i.effort);
    totalPoints += points;
    earnedPoints += points * statusCompletionCredit(i.status as IssueStatus);
  }
  const percent =
    totalPoints === 0 ? 0 : Math.round((earnedPoints / totalPoints) * 100);
  return { done, total, percent };
}
