"use client";

import type {
  CreateObjectiveInput,
  Objective,
  ObjectiveUpdateInput,
} from "./types";

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
      (data as { error?: string } | null)?.error || text.trim() || "Requête échouée";
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
  return parseJson<Objective>(
    await fetch(`/api/objectives/${objectiveId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteObjectiveApi(objectiveId: string): Promise<void> {
  const response = await fetch(`/api/objectives/${objectiveId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Suppression échouée"
    );
  }
}
