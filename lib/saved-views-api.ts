"use client";

import type { SavedView } from "./types";
import { trackEvent } from "./analytics";

/**
 * Les VUES ENREGISTRÉES de la palette (une adresse + un nom, personnelles).
 * Distinct de `views-api.ts`, qui sert les vues de board (filtres, tri,
 * partage) — même mot, deux objets.
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
  // APRÈS la réponse : compter une vue créée sur un 400, un 401 ou une coupure
  // réseau ferait mentir la mesure dans le sens le plus flatteur.
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
