/**
 * Détection d'un déploiement plus récent que celui chargé dans l'onglet
 * (MIN-157) — la partie pure, sans React ni fetch, pour être testable.
 *
 * Deux SHA se font face : celui du BUILD, inliné dans le bundle par
 * `next.config.mjs`, et celui que renvoie `/api/version`, qui vient du
 * déploiement servant la requête. S'ils diffèrent, l'onglet fait tourner du code
 * qui n'est plus celui de la production.
 *
 * Le refus est mémorisé par SHA SERVEUR, pas par un booléen : refuser une
 * version ne doit pas éteindre la suivante.
 */

/** Le SHA de CE bundle. Vide en local, et si les variables système de Vercel
    sont décochées — dans les deux cas la détection reste muette. */
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ?? "";

/** Clé localStorage du dernier SHA refusé. Préfixe `minddy.` comme le cache de
    queries (lib/query-provider.tsx). */
export const DISMISSED_VERSION_KEY = "minddy.dismissed-version";

/** Le SHA refusé, ou null si l'utilisateur n'a rien refermé (ou pas de stockage). */
export function readDismissedCommit(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(DISMISSED_VERSION_KEY) || null;
  } catch {
    // localStorage indisponible (navigation privée stricte) → aucun refus connu.
    return null;
  }
}

/** Mémorise le SHA refusé pour ne plus rouvrir le bandeau sur celui-là. */
export function writeDismissedCommit(commit: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_VERSION_KEY, commit);
  } catch {
    // Sans stockage, le bandeau réapparaîtra : c'est le comportement sûr.
  }
}

export function shouldShowNewVersion({
  buildCommit,
  serverCommit,
  dismissedCommit,
}: {
  buildCommit: string;
  serverCommit: string | undefined;
  dismissedCommit: string | null;
}): boolean {
  // Un SHA manquant d'un côté ou de l'autre ne prouve rien : on se tait.
  if (!buildCommit || !serverCommit) return false;
  if (buildCommit === serverCommit) return false;
  return serverCommit !== dismissedCommit;
}
