import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Re-authentication before an irreversible gesture (MIN-345).
 *
 * Account deletion did not require any: an open session and a copied
 * address were enough. However, this gesture does not only destroy one account - it
 * cascades all the projects owned, their tickets, their files,
 * and the access of their members. A station left unlocked for five minutes, or a
 * token stolen, and the entire team loses their job.
 *
 * What is required depends on what the account CAN produce:
 *
 * - **Account with password**: the password, double-checked with GoTrue.
 * This is the most direct proof, and the only one that nothing else has.
 * - **OAuth account only** (Google, GitHub): There is no password to ask for again. We then require that the authentication be RECENT — fifteen
 * minutes —, which is what the JWT claim `amr` dates for us. Reconnecting at
 * the provider is the equivalent gesture, and it is one disconnection away.
 */

/** Beyond that, authentication is no longer proof of presence. */
export const REAUTH_MAX_AGE_SECONDS = 15 * 60;

/** Code returned to the caller: “reconnect, then try again”. */
export const REAUTH_REQUIRED_CODE = "reauth_required";

/**
 * Does the account have a password identity? `providers` lists everything that
 * can log on to; `provider` only is the form of accounts which
 * only have one.
 */
export function hasPasswordIdentity(appMetadata: unknown): boolean {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  const meta = appMetadata as { provider?: unknown; providers?: unknown };
  if (Array.isArray(meta.providers)) return meta.providers.includes("email");
  return meta.provider === "email";
}

/**
 * When was this session last authenticated?
 *
 * `amr` ("authentication methods references") carries a timestamp per method
 * presented — password, OAuth, TOTP. We keep the most recent: it is the
 * last moment when someone proved something.
 *
 * **The fallback to `iat` is worth less, and this is deliberate.** A token refreshes
 * by itself every hour, so its `iat` does not date not an authentication.
 * But a token without `amr` * — which no version of GoTrue in use
 * produces — would otherwise leave an OAuth account permanently incapable of deleting itself, and locking someone out is the worse of the two flaws.
 */
export function lastAuthenticationAt(
  claims: { amr?: unknown; iat?: unknown } | null | undefined
): number | null {
  if (!claims) return null;
  if (Array.isArray(claims.amr)) {
    const stamps = claims.amr
      .map((entry) =>
        entry && typeof entry === "object"
          ? (entry as { timestamp?: unknown }).timestamp
          : null
      )
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (stamps.length > 0) return Math.max(...stamps);
  }
  return typeof claims.iat === "number" && Number.isFinite(claims.iat) ? claims.iat : null;
}

export function isRecentlyAuthenticated(
  claims: { amr?: unknown; iat?: unknown } | null | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  const at = lastAuthenticationAt(claims);
  if (at === null) return false;
  return nowSeconds - at <= REAUTH_MAX_AGE_SECONDS;
}

/**
 * The password, double-checked with GoTrue.
 *
 * DISPOSABLE client, without persistence: this connection should not open anything, it
 * is only used to answer yes or no. A cookie client would write a new session
 * on the response — and rotate the person's refresh token as it passes.
 */
export async function verifyAccountPassword(
  email: string,
  password: string
): Promise<boolean> {
  if (!email || !password) return false;
  const supabase = createClient(
    process.env.MINDDY_PUBLIC_SUPABASE_URL!,
    process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return false;
  // The resulting session has no reason to survive this question.
  if (data.session) await supabase.auth.signOut({ scope: "local" });
  return Boolean(data.user);
}
