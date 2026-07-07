"use client";

import type { CreateIssueInput, CreateTriageItemInput, Issue, TriageItem } from "./types";

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

export async function fetchTriageItemsApi(projectId: string): Promise<TriageItem[]> {
  return parseJson<TriageItem[]>(await fetch(`/api/projects/${projectId}/triage`));
}

export async function createTriageItemApi(
  projectId: string,
  input: CreateTriageItemInput
): Promise<TriageItem> {
  return parseJson<TriageItem>(
    await fetch(`/api/projects/${projectId}/triage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function acceptTriageItemApi(
  itemId: string,
  input: CreateIssueInput
): Promise<Issue> {
  return parseJson<Issue>(
    await fetch(`/api/triage/${itemId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function rejectTriageItemApi(itemId: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(`/api/triage/${itemId}/reject`, { method: "POST" })
  );
}
