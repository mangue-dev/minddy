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
 * Envoie une image comme icône du projet (owner). Aucun redimensionnement côté
 * client : le serveur compresse, et lui seul décide du format stocké.
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
 * Aperçu du favicon d'un site, sans projet et sans rien stocker : le wizard de
 * création montre l'icône avant que le projet existe, l'import réel
 * ({@link importProjectIconApi}) suit à la création.
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
 * Même aperçu, pour un fichier : renvoie l'image compressée en data URL. Le
 * wizard la garde en brouillon et {@link uploadProjectIconDataUrlApi} la rejoue
 * une fois le projet créé.
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

/** Rejoue une data URL d'aperçu comme icône du projet fraîchement créé. */
export async function uploadProjectIconDataUrlApi(
  id: string,
  dataUrl: string
): Promise<{ icon_url: string }> {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadProjectIconApi(id, blob);
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
