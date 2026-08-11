"use client";

import type { Page, PageVersion } from "./pages";
import type { IssueEvent } from "./types";

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

/**
 * Une erreur qui garde son CODE.
 *
 * Le refus de cycle (409) ne se distingue pas d'une autre panne par son
 * message — il est traduit côté serveur, donc illisible pour du code. L'arbre a
 * pourtant besoin de faire la différence : un 409 se rattrape (on remet la page
 * où elle était et on le dit), une panne réseau non.
 */
export class PageApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PageApiError";
  }
}

/**
 * L'écriture refusée parce que la page a bougé sous nos pieds (MIN-271).
 *
 * Elle porte la page du SERVEUR, corps compris : c'est ce qui permet de
 * fusionner par bloc tout de suite (`lib/pages-merge.ts`) au lieu d'aller
 * redemander le document — un aller-retour de plus, exactement au moment où
 * deux personnes écrivent en même temps.
 */
export class PageConflictError extends PageApiError {
  constructor(
    message: string,
    readonly page: Page
  ) {
    super(message, 409);
    this.name = "PageConflictError";
  }
}

/** Le déplacement refusé parce qu'il fermerait une boucle (lib/server/pages.ts).
    Un 409 de VERSION porte sa page : ce n'est pas le même refus, et l'arbre ne
    doit pas dire « boucle » à quelqu'un qui vient simplement d'être doublé. */
export function isPageCycleError(error: unknown): boolean {
  return (
    error instanceof PageApiError &&
    error.status === 409 &&
    !(error instanceof PageConflictError)
  );
}

async function ok(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const data = (await response.json().catch(() => null)) as
    | { error?: string; conflict?: boolean; page?: Page }
    | null;
  const message = data?.error || fallback;
  if (response.status === 409 && data?.conflict && data.page) {
    throw new PageConflictError(message, data.page);
  }
  throw new PageApiError(message, response.status);
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
  /**
   * Le corps en MARKDOWN, projeté en JSON par le serveur (`content` l'emporte
   * si les deux sont là). C'est par là que passe le brief collé du wizard de
   * projet : projeter au serveur évite de tirer le schéma de page dans le
   * bundle de l'appelant.
   */
  markdown?: string;
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
  /** Épinglée en tête de la barre secondaire — partagé par le projet. */
  favorite?: boolean;
  /**
   * La version sur laquelle ce corps s'appuie (MIN-271). Envoyée AVEC un
   * `content`, elle en fait une écriture conditionnelle : le serveur répond
   * 409 (`PageConflictError`) plutôt que d'écraser ce qu'un autre a écrit
   * entre-temps. Sans elle, le dernier qui enregistre gagne, en silence.
   */
  version?: number;
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

/**
 * L'écriture de la DERNIÈRE CHANCE, quand l'onglet s'en va.
 *
 * Un `fetch` ordinaire lancé depuis `pagehide` est annulé avec le document : la
 * seconde de frappe qui n'était pas encore partie était perdue à chaque
 * rafraîchissement, et la page rouvrait sur la version d'avant. `keepalive` dit
 * au navigateur de mener la requête à son terme même une fois la page détruite.
 *
 * Ni promesse ni erreur à récupérer : il n'y a plus personne pour les lire.
 * `sendBeacon` ne convient pas — il ne sait pas faire un PATCH.
 */
export function updatePageOnUnload(
  projectId: string,
  pageId: string,
  input: UpdatePageInput
): void {
  void fetch(`/api/projects/${projectId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Copie — récursive elle aussi : la page ET ses sous-pages, liens internes
 * réécrits vers la copie. Rend la RACINE de la copie.
 */
export async function duplicatePageApi(
  projectId: string,
  pageId: string
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/duplicate`, {
      method: "POST",
    }),
    "Duplicate failed"
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

/**
 * DÉTRUIT une page restée vide — pas de corbeille, rien à restaurer.
 *
 * Le seul appelant est le départ d'une page qu'on vient de créer et où l'on n'a
 * rien écrit (lib/pages-draft.ts). Le serveur revérifie qu'elle est bien vide
 * et sans sous-page, et répond 409 sinon : ce chemin ne peut pas faire
 * disparaître du contenu.
 */
export async function discardPageApi(
  projectId: string,
  pageId: string
): Promise<void> {
  await ok(
    await fetch(`/api/projects/${projectId}/pages/${pageId}?discard=1`, {
      method: "DELETE",
    }),
    "Delete failed"
  );
}

/**
 * La même destruction, quand l'onglet s'en va — même raison que
 * `updatePageOnUnload` : un `fetch` ordinaire lancé depuis `pagehide` meurt
 * avec le document.
 */
export function discardPageOnUnload(projectId: string, pageId: string): void {
  void fetch(`/api/projects/${projectId}/pages/${pageId}?discard=1`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
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

/* ─── L'historique (MIN-277) ───────────────────────────────────────────────── */

/** Les états antérieurs d'une page, du plus récent au plus ancien, sans corps. */
export async function fetchPageVersionsApi(
  projectId: string,
  pageId: string
): Promise<PageVersion[]> {
  const data = await json<{ versions: PageVersion[] }>(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/versions`),
    "Request failed"
  );
  return data.versions;
}

/** UNE version, corps compris — ce que l'aperçu en lecture seule monte. */
export async function fetchPageVersionApi(
  projectId: string,
  pageId: string,
  versionId: string
): Promise<PageVersion> {
  return json(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/versions/${versionId}`
    ),
    "Request failed"
  );
}

/**
 * Remet une version en place. Rend la page écrite, corps compris.
 *
 * Une écriture comme une autre : elle incrémente la `version` de la page — donc
 * l'éditeur ouvert doit se recharger dessus plutôt que continuer sur la sienne,
 * qui est désormais périmée.
 */
export async function restorePageVersionApi(
  projectId: string,
  pageId: string,
  versionId: string
): Promise<Page> {
  return json(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/versions/${versionId}/restore`,
      { method: "POST" }
    ),
    "Restore failed"
  );
}

/* ─── L'activité (MIN-278) ─────────────────────────────────────────────────── */

/**
 * Le journal d'une page — créée, modifiée, mise à la corbeille, restaurée —
 * dans l'ordre chronologique, avec ses acteurs déjà résolus par le serveur.
 *
 * Les lignes sont des `IssueEvent` et ce n'est pas un abus de nom : la table est
 * la même (`issue_events`, polymorphe depuis les objectifs), et c'est ce qui
 * permet de les rendre avec le composant d'activité existant plutôt qu'un
 * second, à tenir en phase avec le premier.
 */
export async function fetchPageEventsApi(
  projectId: string,
  pageId: string
): Promise<IssueEvent[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/events`),
    "Request failed"
  );
}
