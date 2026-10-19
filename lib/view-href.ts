/**
 * The address that reopens the current screen — what an app tab restores and
 * what a board view tab links to.
 *
 * In minddy, the address already says almost everything — the route, the
 * wiki page, the settings tab, the open objective, the view of a board. What
 * it doesn't say (the PR selected), the page itself publishes, via
 * lib/current-view-context.tsx.
 *
 * What remains is what needs to be REMOVED. Two families of parameters have
 * nothing to do in that address:
 *
 * - those which place an OVERLAY over the screen — the side panel of an issue
 *   (`?issue=`), the creation wizard (`?new=`, `?setup=`). The address keeps
 *   the page, not the open dialog in front of it.
 * - those which are SINGLE-USE INSTRUCTIONS, which the page consumes and then
 *   clears from the URL: returning from Checkout (`?billing=success`) would
 *   replay its toast each time the address is reopened.
 *
 * The others remain: `?view=`, `?tab=`, `?open=`, `?post=`, `?routine=`,
 * `?pr=` all designate part of what we have in front of us.
 *
 * PURE module (no access to the DOM, no server import).
 */

/**
 * Parameters removed from the address. See the header for the split: overlays
 * on one side, single-use instructions on the other.
 */
export const OVERLAY_PARAMS: readonly string[] = [
  "issue", // side panel of a ticket (project board, /all)
  "new", // creation dialog (?new=1, ?new=issue)
  "setup", // wizard for starting a project (?setup=import|numo)
  "billing", // return from Checkout, consumed then deleted
];

/**
 * `pathname` + query cleaned, plus what the page adds itself.
 *
 * The order of the parameters already present is preserved: it is the one the
 * page wrote, and two equal addresses must remain two identical strings. In
 * `extra`, a value `null` REMOVES the parameter — this is how a page says "no selection"
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
