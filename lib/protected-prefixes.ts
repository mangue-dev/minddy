/**
 * Paths that REQUIRE a session (MIN-88). Everything else falls into the
 * rendering Next — and therefore in 404 if no route matches.
 *
 * It was the opposite until now: the proxy protected "everything except a white list
 *", so any unknown URL — an old link, a fault of
 * hits, `/blog`, `/docs`, `/llms.txt` — started again in `307 → /login?redirect=…`
 * instead of a 404. An infinite soft-404 space: crawl budget burned, and
 * a “Page with redirection” report which grows by itself in Search
 * Console.
 *
 * The downside of a blacklist is that it only forgets what it
 * is protecting: an app route added tomorrow would be public by default.
 * `lib/public-routes.test.ts` reads `app/(app)/` and fails if a folder is missing
 * here.
 *
 * Separate module (and without `next/server`) so this test can import it without
 * loading the middleware runtime.
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
  "/routines",
  "/pull-requests",
  "/statistics",
  "/trash",
  // Forge-relay claim interstitial (`app/(app)/connect/github/`): polls the
  // authenticated claim endpoint, so it requires a session like the settings
  // pages that lead to it.
  "/connect",
  // `/my` is redirected to `/all?view=my` by next.config, but keep it here
  // prevents one day of deactivation of the redirection from exposing it.
  "/my",
  // OAuth screens (consent, success): `app/(auth)/oauth/`.
  "/oauth",
  // Development testbenches (`app/(app)/lab/`), already 404 in production —
  // protected all the same, belt and suspenders. To be removed with them.
  "/lab",
] as const;

/** `/projects` covers `/projects` and `/projects/<id>/…`, never `/projectsfoo`. */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
