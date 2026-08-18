/**
 * Second factor (MIN-132) — how little logic is shared between the proxy, the API and
 * the client. Deliberately isomorphic: no `server-only` here, this module is
 * read in the three runtimes.
 *
 * ## Why a flag in `app_metadata`
 *
 * The enforcement asks two questions: "this session is it in aal2? » and
 * “does this account have an enrolled factor? ". The first reads in the JWT
 * (claim `aal`, signed). The second, no: Supabase exposes it via
 * `session.user.factors`, which comes from the COOKIE. But whoever stole the session can
 * rewrite this cookie and remove `factors` — that is, disable the guard
 * exactly in the scenario that 2FA exists to cover.
 *
 * Hence `app_metadata.mfa_enabled`, written next server with the service key (the
 * client cannot write `app_metadata`) and embedded in each JWT hit
 * then. `getClaims()` verifies the signature locally: the response is
 * free and non-falsifiable.
 *
 * Assumed counterpart: the flag is frozen until the next refresh
 * of the token (≤ 1 h). Upon activation, we refresh the session immediately AND on
 * revokes the other sessions — otherwise an already stolen `aal1` token would remain valid
 * until its own refresh.
 */

/** Flag key in `app_metadata`. */
export const MFA_ENABLED_CLAIM = "mfa_enabled";

/** Error code returned by the API when the session is not mounted in aal2. */
export const MFA_REQUIRED_CODE = "mfa_required";

/** Number of recovery codes issued at once. */
export const RECOVERY_CODE_COUNT = 10;

export function hasMfaEnabled(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  return (appMetadata as Record<string, unknown>)[MFA_ENABLED_CLAIM] === true;
}

/**
 * True when the account has an enrolled factor but the session is not raised
 * to the second level — therefore: there is still a challenge to pass.
 *
 * The refusal is GLOBAL, not limited to a list of sensitive routes. A list
 * would require you to think about it on each new route, and a list that you forget to complete
 * is a flaw that is not visible. As the challenge is posed just
 * after the password, we are only in `aal1` if we abandoned
 * the connection during the process.
 */
export function needsMfaChallenge(
  claims: { aal?: unknown; app_metadata?: unknown } | null | undefined
): boolean {
  if (!claims) return false;
  return hasMfaEnabled(claims.app_metadata) && claims.aal !== "aal2";
}

/**
 * Payload of a JWT, WITHOUT signature verification. Reserved for the proxy, which does not
 * only route: it chooses to send a session to the challenge screen,
 * it does not allow any data. A tinkered token would pass through and be refused
 * by the first API request — `getAuthedUser` checks the signature.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Translates a `challengeAndVerify` failure into a message key.
 *
 * GoTrue responds in English and jargon — “Invalid TOTP code entered”. The
 * coming up as is on the screen means displaying a message which is neither in the person's
 * language nor in their words, at the precise moment when they are already
 * blocked outside. We therefore only keep from the server the useful DISTINCTION: code
 * refused, too many tries, or the rest.
 *
 * The three keys exist in `Auth` and in `AccountSecurity` — the two
 * screens which verify a code — with the proper formulation to everyone.
 */
export type MfaErrorKey =
  | "mfaInvalidCode"
  | "mfaTooManyAttempts"
  | "mfaGenericError";

export function mfaVerifyErrorKey(error: unknown): MfaErrorKey {
  const err = error as { code?: unknown; status?: unknown; message?: unknown };
  const code = typeof err?.code === "string" ? err.code : "";
  const status = typeof err?.status === "number" ? err.status : 0;

  if (code === "over_request_rate_limit" || status === 429) {
    return "mfaTooManyAttempts";
  }
  // `mfa_verification_failed` is the common case; the fallback on 4xx covers the
  // GoTrue variants without naming them one by one (they change, the meaning
  // « ce code ne passe pas » reste).
  if (
    code.startsWith("mfa_verification") ||
    (status >= 400 && status < 500)
  ) {
    return "mfaInvalidCode";
  }
  return "mfaGenericError";
}

/**
 * Format of a recovery code: THREE groups of four characters in
 * Crockford base32 (without I, L, O, U - confusion when spoken or copied).
 *
 * Twelve characters, therefore 60 bits per code (MIN-347). The two original groups
 * only carried 40: enough against an online guess, not enough against
 * a leaky base — 2⁴⁰ fingerprints wipe offline in a few
 * seconds on a graphics card. Entropy and KDF go together: the
 * slow hashing of [lib/server/mfa.ts](server/mfa.ts) makes scanning expensive,
 * those extra 20 bits make it useless. One more group to copy is the
 * price, for a gesture that you make once in your life.
 */
export const RECOVERY_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Significant characters of a code, excluding hyphens. */
export const RECOVERY_CODE_LENGTH = 12;
const RECOVERY_CODE_RE =
  /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Cut into groups of four: the only form in which a code circulates. */
export function formatRecoveryCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join("-");
}

/**
 * Normalizes what the person typed: capital letters, hyphens restored, spaces and
 * spurious separations removed. Returns `null` if it cannot be a code —
 * which avoids having to type the base for an obviously incorrect entry.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length !== RECOVERY_CODE_LENGTH) return null;
  const formatted = formatRecoveryCode(cleaned);
  return RECOVERY_CODE_RE.test(formatted) ? formatted : null;
}
