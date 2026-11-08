"use client";

import type { NumoWatchItem } from "@/lib/numo-watches";

/** Calls to `/api/account/numo-watches` (MIN-923), with the server's error passed through for the toast. */

export type NumoWatchListItem = Omit<NumoWatchItem, "user_id"> & {
  /** The issue's identifier or the objective's name; null when it cannot be read. */
  subject: string | null;
  /** False once the user can no longer open its project: it goes at the next tick. */
  accessible: boolean;
};

export const numoWatchesQueryKey = ["numo-watches"] as const;

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T & { error?: string } | null;
  if (!response.ok) throw new Error(data?.error || "Request failed");
  return data as T;
}

export async function fetchNumoWatchesApi(): Promise<NumoWatchListItem[]> {
  const data = await parseJson<{ watches: NumoWatchListItem[] }>(
    await fetch("/api/account/numo-watches"));
  return data.watches;
}

/** Cancel one reminder. One that already fired or went away counts as cancelled. */
export async function cancelNumoWatchApi(id: string): Promise<void> {
  const response = await fetch(`/api/account/numo-watches/${encodeURIComponent(id)}`,
    { method: "DELETE" });
  if (response.status === 404) return;
  await parseJson(response);
}
