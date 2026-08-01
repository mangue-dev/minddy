/**
 * Les chemins qui EXIGENT une session (MIN-88). Tout le reste tombe dans le
 * rendu Next — et donc en 404 si aucune route ne correspond.
 *
 * C'était l'inverse jusqu'ici : le proxy protégeait « tout sauf une liste
 * blanche », donc n'importe quelle URL inconnue — un vieux lien, une faute de
 * frappe, `/blog`, `/docs`, `/llms.txt` — repartait en `307 → /login?redirect=…`
 * au lieu d'un 404. Un espace de soft-404 infini : du budget de crawl brûlé, et
 * un rapport « Page avec redirection » qui grossit tout seul dans Search
 * Console.
 *
 * La contrepartie d'une liste noire, c'est qu'elle n'oublie que ce qu'on
 * protège : une route d'app ajoutée demain serait publique par défaut.
 * `lib/public-routes.test.ts` lit `app/(app)/` et échoue si un dossier manque
 * ici.
 *
 * Module à part (et sans `next/server`) pour que ce test puisse l'importer sans
 * charger le runtime du middleware.
 */
export const PROTECTED_PREFIXES = [
  "/home",
  "/all",
  "/inbox",
  "/projects",
  "/settings",
  "/billing",
  "/admin",
  "/agents",
  "/pull-requests",
  "/statistics",
  "/trash",
  // `/my` est redirigée vers `/all?view=my` par next.config, mais la garder ici
  // évite qu'un jour de désactivation de la redirection l'expose.
  "/my",
  // Écrans OAuth (consentement, succès) : `app/(auth)/oauth/`.
  "/oauth",
  // Bancs d'essai de développement (`app/(app)/lab/`), déjà 404 en production —
  // protégés quand même, ceinture et bretelles. À retirer avec eux.
  "/lab",
] as const;

/** `/projects` couvre `/projects` et `/projects/<id>/…`, jamais `/projectsfoo`. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
