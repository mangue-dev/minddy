"use client";

import type { CreateIssueInput, Issue, IssueUpdateInput } from "./types";

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
  if (data == null) throw new Error("Réponse vide");
  return data as T;
}

export async function fetchIssuesApi(projectId: string): Promise<Issue[]> {
  return parseJson<Issue[]>(await fetch(`/api/projects/${projectId}/issues`));
}

export async function createIssueApi(
  projectId: string,
  input: CreateIssueInput
): Promise<Issue> {
  return parseJson<Issue>(
    await fetch(`/api/projects/${projectId}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateIssueApi(
  issueId: string,
  updates: IssueUpdateInput
): Promise<Issue> {
  return parseJson<Issue>(
    await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteIssueApi(issueId: string): Promise<void> {
  const response = await fetch(`/api/issues/${issueId}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Suppression échouée"
    );
  }
}
