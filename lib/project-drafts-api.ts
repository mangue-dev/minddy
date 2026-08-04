"use client";

import {
  projectDraftFromRow,
  projectDraftToRow,
  type ProjectDraft,
  type ProjectDraftInput,
  type ProjectDraftRow,
} from "./project-draft";

/**
 * Les allers-retours réseau des brouillons de création de projet. La FORME du
 * brouillon et sa relecture défensive sont dans lib/project-draft.ts.
 */

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

export async function fetchProjectDraftsApi(): Promise<ProjectDraft[]> {
  const rows = await parseJson<ProjectDraftRow[]>(
    await fetch("/api/project-drafts")
  );
  return rows.map(projectDraftFromRow);
}

/**
 * Pose ou remplace un brouillon. L'icône est le seul champ gras (une data URL
 * WebP) : si le brouillon dépassait le plafond de la route, on l'envoie SANS
 * elle plutôt que de perdre la saisie — le reste tient toujours dans quelques
 * centaines d'octets.
 */
export async function saveProjectDraftApi(
  draft: ProjectDraftInput
): Promise<ProjectDraft> {
  const payload = projectDraftToRow(draft);
  if (JSON.stringify(payload.data).length > 512 * 1024) {
    payload.data = { ...payload.data, icon: { kind: "none" } };
  }
  return projectDraftFromRow(
    await parseJson<ProjectDraftRow>(
      await fetch("/api/project-drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    )
  );
}

export async function deleteProjectDraftApi(id: string): Promise<void> {
  const response = await fetch(`/api/project-drafts/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      (data as { error?: string } | null)?.error || "Delete failed"
    );
  }
}
