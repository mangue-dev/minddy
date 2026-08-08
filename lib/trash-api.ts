"use client";

import { trackEvent } from "./analytics";

/** Les cinq types que la corbeille recueille (MIN-133, routines : MIN-201). */
export type TrashType = "issue" | "project" | "objective" | "feedback" | "routine";

export interface TrashActor {
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_seed: string;
}

export interface TrashItem {
  type: TrashType;
  id: string;
  title: string;
  /** « MIN-42 » pour un ticket, la clé du projet pour un projet, sinon null. */
  identifier: string | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  deleted_at: string;
  deleted_by: TrashActor | null;
}

export interface TrashPayload {
  items: TrashItem[];
  /** Jours de conservation, dictés par le serveur (lib/server/trash.ts). */
  retention_days: number;
}

async function ok(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  throw new Error((data as { error?: string } | null)?.error || fallback);
}

export async function fetchTrashApi(): Promise<TrashPayload> {
  const response = await fetch("/api/me/trash");
  await ok(response, "Request failed");
  return (await response.json()) as TrashPayload;
}

export async function restoreTrashItemApi(
  type: TrashType,
  id: string
): Promise<void> {
  trackEvent("trash_item_restored", { item_type: type });
  await ok(
    await fetch(`/api/me/trash/${type}/${id}`, { method: "POST" }),
    "Restore failed"
  );
}

export async function purgeTrashItemApi(
  type: TrashType,
  id: string
): Promise<void> {
  trackEvent("trash_item_purged", { item_type: type });
  await ok(
    await fetch(`/api/me/trash/${type}/${id}`, { method: "DELETE" }),
    "Delete failed"
  );
}

export async function emptyTrashApi(): Promise<void> {
  trackEvent("trash_emptied");
  await ok(await fetch("/api/me/trash", { method: "DELETE" }), "Delete failed");
}
