"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  createObjectiveApi,
  deleteObjectiveApi,
  objectivesQueryFn,
  updateObjectiveApi,
} from "./objectives-api";
import {
  objectiveWrites,
  patchObjectiveEverywhere,
} from "./optimistic/issue-writes";
import { effortToPoints, statusCompletionCredit } from "./cycle";
import { isClosedStatus } from "./issue-constants";
import type { IssueEffort, IssueStatus } from "./issue-constants";
import type {
  CreateObjectiveInput,
  Objective,
  ObjectiveUpdateInput,
} from "./types";

const objectivesKey = (projectId: string) => ["objectives", projectId] as const;

export function useObjectivesQuery(projectId: string | null) {
  const queryClient = useQueryClient();

  const enabled = !!projectId;
  const { data, isPending } = useQuery({
    queryKey: objectivesKey(projectId ?? ""),
    queryFn: objectivesQueryFn(projectId ?? ""),
    enabled,
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

  /**
   * Optimiste depuis MIN-156. Avant, le sélecteur d'état du panneau latéral
   * (et les cartes de la page Objectifs) lisaient `objective.status` du cache
   * et gardaient donc l'ancienne valeur jusqu'à la réponse du refetch : plus
   * d'une seconde à afficher l'état d'avant, juste après l'avoir changé.
   */
  const updateObjective = useCallback(
    async (objectiveId: string, updates: ObjectiveUpdateInput) => {
      const pid = projectId;
      const current = pid
        ? queryClient
            .getQueryData<Objective[]>(objectivesKey(pid))
            ?.find((o) => o.id === objectiveId)
        : undefined;
      // L'inverse du PATCH, champ par champ : c'est là que le cache revient si
      // le serveur refuse, sans toucher au reste de la ligne.
      const before: Partial<Objective> = {};
      if (current) {
        for (const field of Object.keys(updates) as (keyof ObjectiveUpdateInput)[]) {
          (before as Record<string, unknown>)[field] =
            (current[field as keyof Objective] as unknown) ?? null;
        }
      }
      const handle = objectiveWrites.begin({
        kind: "patch",
        id: objectiveId,
        patch: updates as Partial<Objective>,
      });
      if (pid) {
        patchObjectiveEverywhere(
          queryClient,
          pid,
          objectiveId,
          updates as Partial<Objective>
        );
      }
      try {
        const objective = await updateObjectiveApi(objectiveId, updates);
        // La ligne serveur entre dans le cache — pas d'invalidation : c'est ce
        // refetch qui rejouait l'ancien état pendant une seconde.
        if (pid) patchObjectiveEverywhere(queryClient, pid, objectiveId, objective);
        objectiveWrites.settle(handle, objective);
        return objective;
      } catch (err) {
        objectiveWrites.fail(handle);
        if (pid && current) {
          patchObjectiveEverywhere(queryClient, pid, objectiveId, before);
        }
        // Conservé : le toast d'erreur du panneau latéral le récupère.
        throw err;
      }
    },
    [projectId, queryClient]
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
    loading: enabled && isPending,
    createObjective,
    updateObjective,
    deleteObjective,
  };
}

/**
 * Auto progress from linked issues. `done`/`total` stay raw issue counts
 * (closed issues over all linked) for the label, but `percent` — the fill
 * of the progress bar — is the sum of finished EFFORT over total effort, in
 * hidden Fibonacci points (effortToPoints, xs1 s2 m3 l5 xl8, unsized = m), the
 * same weighting the cycle's progression ring uses (cycleCompletionPercent):
 * an XL done + an XS left reads 89 %, not 50 %. Work in flight earns partial
 * credit (statusCompletionCredit) instead of counting for nothing until "done".
 *
 * `done` counts every CLOSED status (done, canceled, duplicate), not just
 * "done": an objective whose remaining issues were all cancelled is finished,
 * and the count has to say the same thing as the bar — statusCompletionCredit
 * already grades a closed issue at 100 %, so counting only "done" showed
 * "3/5" next to 100 %.
 */
export function objectiveProgress(
  objectiveId: string,
  issues: { objective_id: string | null; status: string; effort?: IssueEffort | null }[]
): { done: number; total: number; percent: number } {
  const linked = issues.filter((i) => i.objective_id === objectiveId);
  const total = linked.length;
  const done = linked.filter((i) => isClosedStatus(i.status as IssueStatus)).length;
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
