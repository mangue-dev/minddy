"use client";

/**
 * La DERNIÈRE page ouverte d'un projet, retenue d'une visite à l'autre.
 *
 * Revenir dans l'onglet Pages tombait sur l'écran « choisissez une page à
 * gauche », alors qu'on y revient presque toujours pour continuer celle qu'on
 * lisait. On retient donc son id, par projet, dans `localStorage` — au même
 * endroit et de la même façon que l'état d'ouverture de l'arbre
 * (components/pages/page-tree.tsx) : une préférence d'affichage, propre à ce
 * poste, qui n'a rien à faire en base.
 *
 * Ce qui n'est PAS retenu ici : que la page existe encore. Elle a pu partir à
 * la corbeille, ou changer de projet ; c'est au lecteur de le vérifier dans la
 * liste avant d'y aller (voir `app/(app)/projects/[id]/pages/page.tsx`).
 */

function lastPageKey(projectId: string): string {
  return `minddy.pages.last.${projectId}`;
}

export function rememberLastPage(projectId: string, pageId: string): void {
  try {
    window.localStorage.setItem(lastPageKey(projectId), pageId);
  } catch {
    // Mode privé, quota plein : l'onglet marche, il ne se souvient pas.
  }
}

export function readLastPage(projectId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastPageKey(projectId));
  } catch {
    return null;
  }
}

export function forgetLastPage(projectId: string): void {
  try {
    window.localStorage.removeItem(lastPageKey(projectId));
  } catch {
    /* voir rememberLastPage */
  }
}
