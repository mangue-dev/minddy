"use client";

import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createUuid } from "@/lib/create-uuid";
import { createObjectiveApi } from "./objectives-api";
import {
  insertObjectiveEverywhere,
  objectiveWrites,
  patchObjectiveEverywhere,
  removeObjectiveEverywhere,
} from "./optimistic/issue-writes";
import type { CreateObjectiveInput, Objective } from "./types";

/** The objective a creation shows at once, built from its input. */
export function buildOptimisticObjective(input: CreateObjectiveInput, projectId: string): Objective {
  const now = new Date().toISOString();
  return {
    id: createUuid(),
    project_id: projectId,
    name: input.name.trim(),
    description: input.description ?? null,
    status: input.status ?? "planned", // same default as the database
    lead_user_id: input.lead_user_id ?? null,
    target_date: input.target_date ?? null,
    color: input.color ?? null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Optimistic objective creation, on the ticket model (lib/optimistic-issue.ts):
 * the row appears in every cache before the request leaves, and the client
 * names it, so the realtime echo of the insert is recognized rather than
 * adopted next to it. A refusal removes the row and says why.
 *
 * `persisted` resolves with the server row. Gestures that need the objective
 * to exist on the server (linking a ticket to it, opening its page) wait for
 * it; it rejects after the failure has been reported.
 */
export function createObjectiveOptimistic(
  queryClient: QueryClient,
  projectId: string,
  input: CreateObjectiveInput,
): { objective: Objective; persisted: Promise<Objective> } {
  const objective = buildOptimisticObjective(input, projectId);
  const handle = objectiveWrites.begin({ kind: "insert", row: objective });
  insertObjectiveEverywhere(queryClient, projectId, objective);
  const persisted = createObjectiveApi(projectId, { ...input, id: objective.id }).then(
    (created) => {
      insertObjectiveEverywhere(queryClient, projectId, created);
      patchObjectiveEverywhere(queryClient, projectId, created.id, created);
      objectiveWrites.settle(handle, created);
      return created;
    },
    (error: unknown) => {
      objectiveWrites.fail(handle);
      removeObjectiveEverywhere(queryClient, projectId, objective.id);
      toast.error(error instanceof Error ? error.message : String(error));
      throw error;
    },
  );
  return { objective, persisted };
}
