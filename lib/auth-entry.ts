/**
 * The single sign-in and sign-up screen (MIN-907), off-screen.
 *
 * The screen asks for an address first. The server then says what that
 * address holds (`/api/auth/lookup`), and the screen asks for the account's
 * password, for a new one, or points to the sign-in service an account
 * without a password was created with.
 */

/** What an address holds: no account, an account with a password, or one without. */
export type AccountStatus = "new" | "password" | "oauth";

const STATUSES: readonly AccountStatus[] = ["new", "password", "oauth"];

export function parseAccountStatus(value: unknown): AccountStatus | null {
  return STATUSES.includes(value as AccountStatus) ? (value as AccountStatus) : null;
}

/** Why a lookup gave no answer, as a key of the `Auth` namespace. */
export type LookupFailure = "errorRateLimited" | "errorUnexpected";

export type LookupResult = { status: AccountStatus } | { failure: LookupFailure };

/** Asks the server what `email` holds. Never throws. */
export async function lookupAccount(email: string, fetcher: typeof fetch = fetch): Promise<LookupResult> {
  try {
    const response = await fetcher("/api/auth/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (response.status === 429) return { failure: "errorRateLimited" };
    if (!response.ok) return { failure: "errorUnexpected" };
    const status = parseAccountStatus(((await response.json()) as { status?: unknown }).status);
    return status ? { status } : { failure: "errorUnexpected" };
  } catch {
    return { failure: "errorUnexpected" };
  }
}

/**
 * Enough to catch a typo, not enough to claim to validate an address: only
 * the confirmation email does that. The browser applies the same rule to an
 * `<input type="email">`; this one lets the screen and the server say no
 * before asking anything.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 3 || /\s/.test(email)) return false;
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return false;
  const domain = email.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * The parameters that follow the person from one auth screen to another, and
 * only them: `redirect`, the destination the proxy sent them here from, and
 * `invite`, the invitation link, without which they would land on `/home`
 * without joining the project waiting for them. Everything else (`error`,
 * `mode`, a `utm_*`) belongs to the screen they came from.
 *
 * Returns a query string prefixed with `?`, or `""` when nothing follows.
 */
export function preserveAuthParams(
  search: URLSearchParams | string,
  extra?: Record<string, string>,
): string {
  const source = typeof search === "string" ? new URLSearchParams(search) : search;
  const kept = new URLSearchParams();
  for (const key of ["redirect", "invite"] as const) {
    const value = source.get(key);
    if (value) kept.set(key, value);
  }
  for (const [key, value] of Object.entries(extra ?? {})) kept.set(key, value);
  const query = kept.toString();
  return query ? `?${query}` : "";
}
