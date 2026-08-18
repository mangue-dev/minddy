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

/** Imports the live site favicon as the project icon (owner). */
export async function importProjectIconApi(
  id: string,
  siteUrl: string
): Promise<{ icon_url: string }> {
  trackEvent("project_icon_changed", { kind: "favicon" });
  return parseJson<{ icon_url: string }>(
    await fetch(`/api/projects/${id}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_url: siteUrl }),
    })
  );
}

/**
 * Sends an image as the project icon (owner). No resizing on the client side: the server compresses, and only it decides the stored format.
 */
export async function uploadProjectIconApi(
  id: string,
  file: Blob
): Promise<{ icon_url: string }> {
  trackEvent("project_icon_changed", { kind: "upload" });
  const body = new FormData();
  body.append("file", file, "icon");
  return parseJson<{ icon_url: string }>(
    await fetch(`/api/projects/${id}/icon`, { method: "POST", body })
  );
}

/**
 * Preview of the favicon of a site, without a project and without storing anything: the wizard of
 * creation shows the icon before the project exists, the real import
 * ({@link importProjectIconApi}) follows upon creation.
 */
export async function previewProjectIconApi(
  siteUrl: string
): Promise<{ icon_url: string }> {
  return parseJson<{ icon_url: string }>(
    await fetch("/api/account/project-icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_url: siteUrl }),
    })
  );
}

/**
 * Same preview, for a file: returns the compressed image as a data URL. The
 * wizard keeps it in draft and {@link uploadProjectIconDataUrlApi} replays it
 * once the project is created.
 */
export async function previewProjectIconFileApi(
  file: Blob
): Promise<{ icon_url: string }> {
  const body = new FormData();
  body.append("file", file, "icon");
  return parseJson<{ icon_url: string }>(
    await fetch("/api/account/project-icon", { method: "POST", body })
  );
}

/** Replays a preview URL data as the icon of the newly created project. */
export async function uploadProjectIconDataUrlApi(
  id: string,
  dataUrl: string
): Promise<{ icon_url: string }> {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadProjectIconApi(id, blob);
}

/**
 * Restarts drawing of the generated orb (owner). The orb cannot be chosen, it
 * withdraws — same gesture as “New avatar” on an account.
 */
export async function regenerateProjectOrbApi(
  id: string
): Promise<{ orb_seed: string }> {
  trackEvent("project_orb_rerolled");
  return parseJson<{ orb_seed: string }>(
    await fetch(`/api/projects/${id}/orb`, { method: "POST" })
  );
}

/** Removes the project icon — returns to the generated orb (owner). */
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
