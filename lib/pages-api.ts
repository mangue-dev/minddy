"use client";

import type { Page } from "./pages";

/**
 * Le client HTTP des pages (MIN-266) — de quoi lire et écrire une page depuis
 * le navigateur, sans rien savoir de la forme des routes.
 *
 * La LISTE ne porte pas le corps des documents (le serveur ne l'envoie pas) :
 * c'est elle qui alimente l'arbre de la sidebar, une fois pour tout le projet.
 * Le corps arrive page par page, à l'ouverture.
 */

/** Une page sans son corps — ce que rend la liste. */
export type PageSummary = Omit<Page, "content">;

async function ok(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const data = await response.json().catch(() => null);
  throw new Error((data as { error?: string } | null)?.error || fallback);
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  await ok(response, fallback);
  return (await response.json()) as T;
}

/** Toutes les pages vivantes du projet, à plat (`buildPageTree` fait l'arbre). */
export async function fetchPagesApi(projectId: string): Promise<PageSummary[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages`),
    "Request failed"
  );
}

/** Une page avec son corps. */
export async function fetchPageApi(
  projectId: string,
  pageId: string
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`),
    "Request failed"
  );
}

export interface CreatePageInput {
  title?: string;
  icon?: string | null;
  /** Sous-page : l'id du parent. Absent = page racine. */
  parent_id?: string | null;
  content?: unknown;
}

export async function createPageApi(
  projectId: string,
  input: CreatePageInput = {}
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Create failed"
  );
}

export interface UpdatePageInput {
  title?: string;
  icon?: string | null;
  /**
   * Déplacement. Le serveur REFUSE (409) de mettre une page sous un de ses
   * propres descendants : la profondeur est illimitée, une boucle ferait partir
   * l'arbre en récursion infinie.
   */
  parent_id?: string | null;
  /** Index fractionnaire calculé par `positionBetween` (lib/pages.ts). */
  position?: string;
  content?: unknown;
}

export async function updatePageApi(
  projectId: string,
  pageId: string,
  input: UpdatePageInput
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Update failed"
  );
}

/** Corbeille — récursive : la page ET ses sous-pages. Rien n'est détruit. */
export async function trashPageApi(
  projectId: string,
  pageId: string
): Promise<{ trashed: number }> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "DELETE",
    }),
    "Delete failed"
  );
}

/** Le retour en arrière immédiat (un « Annuler » de toast). */
export async function restorePageApi(
  projectId: string,
  pageId: string
): Promise<{ restored: number }> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/restore`, {
      method: "POST",
    }),
    "Restore failed"
  );
}
