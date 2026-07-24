"use client";

import type {
  CreateObjectiveInput,
  Objective,
  ObjectiveUpdateInput,
} from "./types";
import { trackEvent } from "./analytics";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchObjectivesApi(projectId: string): Promise<Objective[]> {
  return parseJson<Objective[]>(await fetch(`/api/projects/${projectId}/objectives`));
}

export async function createObjectiveApi(
  projectId: string,
  input: CreateObjectiveInput
): Promise<Objective> {
  trackEvent("objective_created", {});
  return parseJson<Objective>(
    await fetch(`/api/projects/${projectId}/objectives`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateObjectiveApi(
  objectiveId: string,
  updates: ObjectiveUpdateInput
): Promise<Objective> {
  for (const field of Object.keys(updates)) {
    trackEvent("objective_updated", { field });
  }
  return parseJson<Objective>(
    await fetch(`/api/objectives/${objectiveId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteObjectiveApi(objectiveId: string): Promise<void> {
  trackEvent("objective_deleted", {});
  const response = await fetch(`/api/objectives/${objectiveId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}
