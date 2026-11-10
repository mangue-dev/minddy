"use client";

import type { NumoWatchItem, NumoWatchProposal } from "@/lib/numo-watches";

/** Calls to `/api/account/numo-watches` (MIN-923), with the server's error passed through for the toast. */

export type NumoWatchListItem = Omit<NumoWatchItem, "user_id"> & {
  /** The issue's identifier or the objective's name; null when it cannot be read. */
  subject: string | null;
  /** False once the user can no longer open its project: it goes at the next tick. */
  accessible: boolean;
};

export const numoWatchesQueryKey = ["numo-watches"] as const;

/** A refusal the screen words itself, by the server's `code`. */
export class NumoWatchApiError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as T & { error?: string; code?: string } | null;
  if (!response.ok) throw new NumoWatchApiError(data?.error || "Request failed", data?.code ?? null);
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

/** Pause or resume one recurring reminder (MIN-953). */
export async function setNumoWatchPausedApi(id: string, paused: boolean): Promise<void> {
  await parseJson(await fetch(`/api/account/numo-watches/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paused }),
  }));
}

/** Confirm a recurring reminder Numo proposed with permissions (MIN-953). */
export async function confirmNumoWatchProposalApi(proposal: NumoWatchProposal): Promise<void> {
  await parseJson(await fetch("/api/account/numo-watches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  }));
}
