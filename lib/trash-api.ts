"use client";

import { trackEvent } from "./analytics";

/**
 * The six types that the recycle bin collects (MIN-133; routines: MIN-201;
 * pages: MIN-266, whose line represents the page AND its subpages).
 */
export type TrashType =
  | "issue"
  | "project"
  | "objective"
  | "feedback"
  | "routine"
  | "page";

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
  /** “MIN-42” for a ticket, the project key for a project, otherwise null. */
  identifier: string | null;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  project_icon_url: string | null;
  project_orb_seed: string | null;
  deleted_at: string;
  deleted_by: TrashActor | null;
}

export interface TrashPayload {
  items: TrashItem[];
  /** Retention days, dictated by the server (lib/server/trash.ts). */
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
