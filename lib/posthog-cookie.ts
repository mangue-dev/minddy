/**
 * Find, from the SERVER, the PostHog identity of the browser (MIN-292).
 *
 * `/api/desktop/download` is a public route: no session, therefore no
 * account id to give to `captureServerEvent`. Without anything, each
 * download would leave under a discarded id, and the event would not be linked to
 * no path — we would know HOW MUCH, never AS A RESULT OF WHAT.
 *
 * `posthog-js` writes its `distinct_id` in a cookie `ph_<key>_posthog`, which the
 * browser attaches to the request like all others. Reading it here is enough to
 * stitch the server event to the rest of the visit — the page viewed, the click on
 * the button, the inscription that follows.
 *
 * **This cookie only exists if the cookies have been ACCEPTED**: before any choice,
 * the persistence is in memory and nothing is written to the device (see
 * components/posthog-init.tsx). The fallback is therefore not a rare case but the ordinary case
 *, and it must certainly not invent a stable identifier: this
 * would pose on the server side exactly the follow-up that the browser refused
 * to pose. The caller pulls a throwaway id and cuts off the person's profile.
 *
 * PUR module — it doesn't read `process.env` or the headers: everything goes into a
 * parameter, and that's what makes it testable without a query.
 */

/** The cookie name of `posthog-js` for a given project key. */
export function posthogCookieName(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  return `ph_${apiKey}_posthog`;
}

/** Length beyond which we refuse the value: a forged cookie. */
const MAX_DISTINCT_ID_LENGTH = 200;

/**
 * The `distinct_id` carried by the cookie value, or `null`.
 *
 * The value is JSON, sometimes URL encoded depending on who read it again — hence the
 * second attempt after `decodeURIComponent`. Anything that is not a JSON
 * carrying a non-empty string returns `null`: it is data that comes from the
 * client, it is verified.
 */
export function readPosthogDistinctId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parsed = parseJson(raw) ?? parseJson(safeDecode(raw));
  const id = (parsed as { distinct_id?: unknown } | null)?.distinct_id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed || trimmed.length > MAX_DISTINCT_ID_LENGTH) return null;
  return trimmed;
}

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    // `decodeURIComponent` RISES on an isolated `%` — common in a cookie
    // DIY by hand. An exception here would cause a download to drop.
    return null;
  }
}
