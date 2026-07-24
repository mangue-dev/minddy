"use client";

import type { CreateProjectInput, Project, ProjectUpdateInput } from "./types";
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
      (data as { error?: string } | null)?.error ||
      text.trim() ||
      "Request failed";
    throw new Error(message);
  }
  if (data == null) throw new Error("Empty response");
  return data as T;
}

export async function fetchProjectsApi(): Promise<Project[]> {
  return parseJson<Project[]>(await fetch("/api/projects"));
}

export async function createProjectApi(input: CreateProjectInput): Promise<Project> {
  return parseJson<Project>(
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
}

export async function updateProjectApi(
  id: string,
  updates: ProjectUpdateInput
): Promise<Project> {
  return parseJson<Project>(
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

/** Importe le favicon du site live comme icône du projet (owner). */
export async function importProjectIconApi(
  id: string,
  siteUrl: string
): Promise<{ icon_url: string }> {
  return parseJson<{ icon_url: string }>(
    await fetch(`/api/projects/${id}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_url: siteUrl }),
    })
  );
}

/** Retire l'icône du projet — retour à l'orbe générée (owner). */
export async function clearProjectIconApi(id: string): Promise<void> {
  trackEvent("project_icon_changed", { kind: "orb" });
  const response = await fetch(`/api/projects/${id}/icon`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Request failed"
    );
  }
}

export async function deleteProjectApi(id: string): Promise<void> {
  trackEvent("project_deleted", { project_id: id });
  const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}
