/**
 * What the app window shows, and what it denies (MIN-291, MIN-292).
 *
 * **The rule is in one sentence: the desktop app only shows
 * authentication and the app.** Everything else that our origin does —
 * sales pitch, prices, MCP server, comparisons, new features,
 * legal pages, download page, and public areas at
 * token (feedback board, published page, shared view) — opens in the
 * system browser.
 *
 * This is not a usability preference, it is a question of identity. An installed
 * window which displays “Try minddy for free”, a banner of
 * cookies or a price list is aimed at someone who has not yet decided to
 * - this person does not exist here: she downloaded, she passed the
 * first launch, she wants her job. And a public feedback board in
 * the desktop app, it's the website in a window.
 *
 * **Three outcomes, not two**, and the nuance matters:
 *
 * - `allow` — the app, authentication, internal routes.
 * - `external` — the page goes to the browser. This is the general case.
 * - `home` — the LANDING, and it alone. It is not a destination that one
 * asks for: we find it, through a logo which points to `/`. Launching a browser
 * every time a logo is clicked would be a punishment; we return to the entrance, which leads to
 * the app or to the connection depending on the session.
 *
 * **The list DERIVES from [public-routes.ts](../public-routes.ts)**, it is not copied
 *: adding a public page automatically puts it out of the
 * window, without anyone having to think about it.
 */

import { PUBLIC_ROUTE_PATHS } from "@/lib/public-routes";

/**
 * What to do with a URL from OUR origin.
 *
 * The origin is the business of [nav-guard.ts](nav-guard.ts): this module
 * only applies to paths from us.
 */
export type DesktopRouteDisposition = "allow" | "external" | "home";

/**
 * Public TOKEN surfaces. They are not in `PUBLIC_ROUTES` — their
 * URL is not a page but an authorization — and they are therefore recognized as
 * by their prefix. Without them, it was enough to paste the link of a feedback board to open the public site IN the app.
 */
const TOKEN_PREFIXES = ["/f/", "/p/", "/share/"] as const;

/**
 * The landing, in both languages. The only public path that we bring back to
 * the entrance instead of sending it outside — see the header.
 */
const LANDING_PATHS: ReadonlySet<string> = new Set(["/", "/fr"]);

/** `/pricing/` and `/pricing` are the same page; `/` remains `/`. */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * The path of a URL or a path — the main process sees URLs passing, the
 * renders paths. `null` when it is neither.
 */
function pathnameOf(pathOrUrl: string): string | null {
  if (pathOrUrl.startsWith("/")) return normalize(new URL(pathOrUrl, "http://x").pathname);
  try {
    return normalize(new URL(pathOrUrl).pathname);
  } catch {
    return null;
  }
}

/** What to do with this URL? The only decision point. */
export function routeDisposition(pathOrUrl: string): DesktopRouteDisposition {
  const pathname = pathnameOf(pathOrUrl);
  // Unreadable: we do not block on a channel that we have not been able to read — keep it
  // originally, she has already refused everything that is not with us.
  if (pathname === null) return "allow";

  if (LANDING_PATHS.has(pathname)) return "home";
  if (PUBLIC_ROUTE_PATHS.has(pathname)) return "external";
  if (TOKEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "external";
  return "allow";
}

/** Should this URL leave the window somehow? */
export function leavesTheWindow(pathOrUrl: string): boolean {
  return routeDisposition(pathOrUrl) !== "allow";
}
