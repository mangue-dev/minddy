/**
 * Where the app window is allowed to go (MIN-291).
 *
 * The renderer loads REMOTE CODE with our `preload` attached. If a link
 * to a third party site opened this site *in* the window, this site would inherit the
 * bridge — that is, `openExternal` and the rest. Custody is therefore not a
 * courtesy of UX: this is the boundary of the exposed surface.
 *
 * PUR module: the decision is made here and tested here; `desktop/src/main.ts`
 * just wires it to `will-navigate` and `setWindowOpenHandler`.
 */

/**
 * - `allow` — our origin, the window navigates.
 * - `external` — an ordinary web page elsewhere: it goes to the browser
 * system.
 * - `block` — none of that (`file:`, `javascript:`, `data:`, a URL
 * illegible). We do not sail, nor do we spend it
 * `shell.openExternal`, which would give it to the system: `open` on a `file://`
 * or a pattern registered by another app, it's execution.
 */
export type NavigationDecision = "allow" | "external" | "block";

/** The only diagrams that we agree to entrust to the system browser. */
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/**
 * What to do with a navigation to `target`, the window being at `origin`?
 *
 * The comparison concerns the complete ORIGIN (schema + host + port), never on
 * the host alone: ​​`http://www.minddy.app` and a neighboring subdomain are
 * third parties like the others, and must come out.
 */
export function navigationDecision(
  target: string,
  origin: string
): NavigationDecision {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return "block";
  }

  let home: URL;
  try {
    home = new URL(origin);
  } catch {
    return "block";
  }

  if (url.origin === home.origin) return "allow";
  return EXTERNAL_SCHEMES.has(url.protocol) ? "external" : "block";
}
