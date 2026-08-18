/**
 * The address of a saved view — what, from the current screen, re-opens.
 *
 * A saved view does not photograph a screen: it retains the ADDRESS which
 * reconstitutes it. In minddy, the address already says almost everything — the route, the
 * wiki page, the settings tab, the open objective, the view of a board.
 * What it doesn't say (the conversation chosen in /agents, the PR
 * selected), is the page itself which publishes it, via
 * lib/current-view-context.tsx.
 *
 * What remains is what needs to be REMOVED. Two families of parameters have nothing to do
 * in a saved view:
 *
 * - those which place an OVERPRINT over the screen — the side panel
 * of a ticket (`?issue=`), the creation wizard (`?new=`, `?setup=`), the
 * draft conversation (`?compose=`). A saved view saves the
 * page, not the open dialog in front of it.
 * - those which are SINGLE-USE INSTRUCTIONS, which the page consumes and then clears
 * from the URL: returning Checkout (`?billing=success`) would replay its
 * toast each time it is opened of the view.
 *
 * The others remain: `?view=`, `?tab=`, `?open=`, `?post=`, `?run=`,
 * `?routine=`, `?pr=` all designate part of what we have in front of us.
 *
 * PUR module (no access to the DOM, no server import): the client uses it
 * to create the address, the server to validate it before write.
 */

/**
 * Settings removed from address when saving. See header for
 * sharing: overprints on one side, single-use instructions on the other.
 */
export const OVERLAY_PARAMS: readonly string[] = [
  "issue", // side panel of a ticket (project board, /all)
  "new", // creation dialog (?new=1, ?new=issue)
  "setup", // wizard for starting a project (?setup=import|numo)
  "compose", // brouillon de conversation de l'agent
  "billing", // return from Checkout, consumed then deleted
];

/** Maximum length of a registered address (MIN-118 terminals). */
export const MAX_HREF_LENGTH = 2000;
/** Maximum length of a view name — like board views. */
export const MAX_VIEW_NAME_LENGTH = 200;

/**
 * `pathname` + query cleaned, plus what the page adds itself.
 *
 * The order of the parameters already present is preserved: it is the one that the page has
 * writes, and two addresses identical to the order must remain two identical texts
 * (the uniqueness of the name is based on this). In `extra`, a value
 * `null` REMOVES the parameter — this is how a page says "no selection"
 * without having to copy the cleanup logic again.
 */
export function buildViewHref(
  pathname: string,
  search: string,
  extra?: Record<string, string | null>
): string {
  const path = pathname || "/";
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of OVERLAY_PARAMS) params.delete(key);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * A saveable address is an INTERNAL address: an absolute path, without
 * scheme or host. `//ailleurs.example` is an absolute path to the grammar
 * of URLs but a protocol-relative address for a browser — it goes outside the
 * site, and that's exactly what a record should not be able to do.
 */
export function isSavedViewHref(href: unknown): href is string {
  if (typeof href !== "string") return false;
  if (href.length === 0 || href.length > MAX_HREF_LENGTH) return false;
  if (!href.startsWith("/")) return false;
  if (href.startsWith("//")) return false;
  // `/\ailleurs`: some browsers read the backslash as a bar.
  if (href.startsWith("/\\")) return false;
  // An address contains neither space nor control character: a jump from
  // line pasted in the field must not become a route.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(href)) return false;
  return true;
}

/**
 * The name as it will be stored: spaces trimmed, length bounded. `null` when
 * nothing left — calling it a "name required" error.
 */
export function normalizeViewName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_VIEW_NAME_LENGTH);
}
