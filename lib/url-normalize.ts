/**
 * Complete a hand-typed address (MIN-184).
 *
 * No one types `https://`. A link sticks or dictates itself — "linear.app",
 * "www.example.fr/docs" — and refusing it for a missing schema is
 * asking the user to do the work that the machine knows how to do.
 *
 * The rule lives here, in one place, because BOTH ends apply it :
 * the browser dialog before sending, and
 * [favicon.ts](./server/favicon.ts) before resolving — the latter also being
 * what `minddy_add_resource` and Numo's `add_resource` tool touch, where
 * no dialog is passed before. Two divergent standardizations would like
 * to say that a URL accepted in the app is refused by an agent, or vice versa.
 */

/**
 * `linear.app` has no schema, `javascript:alert(1)` has one, and
 * `exemple.com:8080` looks like both. What separates them: a real schema
 * NEVER contains a point. `exemple.com:` is therefore a host followed by a port,
 * to be prefixed — not an exotic protocol to be refused further down.
 */
export function hasUrlScheme(value: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(value.trim());
  return !!match && !match[1].includes(".");
}

/** The address as it will be given to `new URL`: unchanged if it already carries
 a schema, prefixed with `https://` otherwise. Do NOT judge its validity. */
export function withUrlScheme(raw: string): string {
  const trimmed = raw.trim();
  return hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * The completed address IF it's a plausible web URL, null otherwise. A
 * pre-check, not an authorization: the server revalidates everything (protocol, IP
 * private, DNS) — here we are only avoiding a round trip for an entry which
 * clearly has no chance.
 */
export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = withUrlScheme(trimmed);
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // A host without a point is not publicly reachable (`localhost`, a name
    // intranet): the server would refuse it anyway, we might as well say it completely
    // immediately, in the field where the address has just been entered.
    if (!url.hostname.includes(".")) return null;
    return candidate;
  } catch {
    return null;
  }
}
