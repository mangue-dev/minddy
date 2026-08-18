"use client";

import type { SavedView } from "./types";
import { trackEvent } from "./analytics";

/**
 * SAVED VIEWS of the palette (an address + a name, personal).
 * Distinct from `views-api.ts`, which serves board views (filters, sorting,
 * sharing) — same word, two objects.
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
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchSavedViewsApi(): Promise<SavedView[]> {
  return parseJson<SavedView[]>(await fetch("/api/me/saved-views"));
}

export async function createSavedViewApi(input: {
  name: string;
  href: string;
}): Promise<SavedView> {
  const view = await parseJson<SavedView>(
    await fetch("/api/me/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
  );
  // AFTER the response: count a view created on a 400, a 401 or a cut
  // network would lie to the measure in the most flattering sense.
  trackEvent("saved_view_created", {});
  return view;
}

export async function updateSavedViewApi(
  id: string,
  updates: { name?: string; href?: string }
): Promise<SavedView> {
  return parseJson<SavedView>(
    await fetch(`/api/me/saved-views/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
  );
}

export async function deleteSavedViewApi(id: string): Promise<void> {
  await parseJson<{ ok: true }>(
    await fetch(`/api/me/saved-views/${id}`, { method: "DELETE" })
  );
}
