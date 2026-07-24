"use client";

import type { CreateIssueRelationInput, IssueRelation } from "./types";
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
  if (data == null) throw new Error("Empty response");
  return data as T;
}

export async function fetchIssueRelationsApi(
  projectId: string
): Promise<IssueRelation[]> {
  return parseJson<IssueRelation[]>(
    await fetch(`/api/projects/${projectId}/issue-relations`)
  );
}

export async function addIssueRelationApi(
  projectId: string,
  input: CreateIssueRelationInput
): Promise<IssueRelation> {
  trackEvent("issue_relation_added", { relation: input.type });
  return parseJson<IssueRelation>(
    await fetch(`/api/projects/${projectId}/issue-relations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function removeIssueRelationApi(relationId: string): Promise<void> {
  trackEvent("issue_relation_removed", { relation: "unknown" });
  const response = await fetch(`/api/issue-relations/${relationId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}
