/**
 * `minddy://open?next=…` — return the window to a specific page (MIN-293).
 *
 * ## Why there is
 *
 * Stripe. The payment opens in the system browser, and this is normal: a
 * credit card page in an installed window is exactly what we don't want to have to audit. But Stripe then returns to its
 * `success_url` — a **http(s)** URL, it does not accept any other — and this
 * return was done in the browser. We finished a purchase started in
 * the app by finding ourselves in front of its billing page in Safari, the app
 * still open behind, still on the old plan.
 *
 * Hence the two-step bounce: Stripe returns to a page of ours
 * (`/desktop/return`, app/desktop/return/route.ts), which only exists to
 * reopen the app on this link. The same path will apply for any round trip of the
 * same type — that's why the link has a DESTINATION and not "the
 * payment is finished".
 *
 * ## The two halves, and why they are in the same file
 *
 * `buildDesktopOpenUrl` is read by the bounce page, served to the BROWSER;
 * `parseDesktopOpenLink` is read by the MAIN PROCESS, which receives the link. Same
 * reason that between the two halves of auth-link.ts: it's a contract between two
 * processes, and rereading them separately doesn't check it.
 *
 * ## What the destination cannot be
 *
 * An internal path, and nothing else (`sanitizeInternalRedirectPath`). The link
 * arrives from the system: macOS delivers to the app EVERYTHING that carries our schema, including
 * including what we have never sent. An absolute destination would be a window
 * that a third party can point anywhere they want.
 */

import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { DESKTOP_OPEN_HOST, DESKTOP_PROTOCOL } from "@/lib/desktop/config";

/** `minddy://open?next=/billing%3Fbilling%3Dsuccess`. */
export function buildDesktopOpenUrl(next: string): string {
  const params = new URLSearchParams({
    next: sanitizeInternalRedirectPath(next),
  });
  return `${DESKTOP_PROTOCOL}://${DESKTOP_OPEN_HOST}?${params.toString()}`;
}

/**
 * Reads a `minddy://open`. Returns `null` for everything else — including
 * `minddy://auth`, which has its own reader.
 */
export function parseDesktopOpenLink(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== `${DESKTOP_PROTOCOL}:`) return null;
  // `minddy://open?x=1` stores the host in `hostname`, `minddy:open?x=1` in the
  // path. Both forms circulate depending on who composes the URL — same tolerance
  // only for the authentication link.
  const host = url.hostname || url.pathname.replace(/^\/*/, "");
  if (host !== DESKTOP_OPEN_HOST) return null;
  const next = url.searchParams.get("next");
  if (!next) return null;
  return sanitizeInternalRedirectPath(next);
}
