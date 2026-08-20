import type { EmailOtpType } from "@supabase/supabase-js";

import { sanitizeInternalRedirectPath } from "@/lib/auth-redirect";
import { parseOtpType } from "@/lib/desktop/auth-link";
import { SESSION_COOKIE_OPTIONS } from "@/lib/session-cookies";

/**
 * The token of an e-mail link, put on hold while we ask the
 * person if they have requested THIS round of authentication (MIN-345).
 *
 * ## What we repair
 *
 * `GET /auth/callback?token_hash=…&type=magiclink` was logging in. A
 * navigation, a token, and the browser is connected — to an account that nothing
 * links to the person in front of the screen. This is session fixation in its
 * simplest form: the attacker requests a link for HIS account, sends it
 * to his victim, and everything she then writes is written to him.
 *
 * The OAuth path does not have this defect and has nothing to do here: The
 * PKCE checker lives in a cookie placed at the START of the round, and
 * `exchangeCodeForSession` fails without it. The trick there is already linked to its
 * initiator, and by a stronger proof than a nonce of ours.
 *
 * ## Why a cookie rather than a nonce in the link
 *
 * Because the link cannot carry one. The GoTrue template composes it
 * itself (`{{ .RedirectTo }}?token_hash=…`): nothing that is added to
 * `emailRedirectTo` survives there properly. And above all, a nonce placed at the start
 * would require opening the email IN the browser which requested the link — which
 * would break the invitation, which by nature has no starting point at its
 * recipient, and the registration confirmation read on the phone.
 *
 * So: we do not consume anything on a `GET`. The token waits in this cookie —
 * `httpOnly` (no script touches it) and `SameSite=Lax` (a `POST` from another site does not take it, so cannot consume it) — and the
 * session does not is born only from the `POST` of a person who has read to whom they are connecting.
 *
 * Pure module, without `server-only`: this is what makes it testable on both sides
 * of the contract, the one who writes the cookie and the one who writes it lit.
 */

export const AUTH_PENDING_COOKIE = "mdy_auth_pending";

/** The time allowed to read the screen and click. The GoTrue token,
 has its own expiration, usually shorter — ours does not extend it, it just limits the trail of the cookie. */
export const AUTH_PENDING_TTL_SECONDS = 15 * 60;

export interface PendingOtp {
  tokenHash: string;
  type: EmailOtpType;
  /** Where to go once the session is open — already sifted. */
  next: string;
}

export function encodePendingOtp(pending: PendingOtp): string {
  return Buffer.from(
    JSON.stringify({
      h: pending.tokenHash,
      t: pending.type,
      n: pending.next,
    })
  ).toString("base64url");
}

/** Returns `null` on anything that is not a workable pending token — a truncated
 cookie, stale in form, or a `type` that GoTrue does not know about
. The `next` goes through the sieve again: this cookie may well be ours, but it has made
 a round trip through the browser. */
export function decodePendingOtp(raw: string | undefined | null): PendingOtp | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const { h, t, n } = parsed as { h?: unknown; t?: unknown; n?: unknown };
    const type = parseOtpType(typeof t === "string" ? t : null);
    if (typeof h !== "string" || !h || !type) return null;
    return {
      tokenHash: h,
      type,
      next: sanitizeInternalRedirectPath(typeof n === "string" ? n : null),
    };
  } catch {
    return null;
  }
}

/** The options for the cookie, both when writing and when deleting — both MUST carry the same `path`, otherwise the deletion misses its target and the consumed
 token remains in the browser. */
export function authPendingCookieOptions(maxAgeSeconds = AUTH_PENDING_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: SESSION_COOKIE_OPTIONS.secure,
    path: "/auth",
    maxAge: maxAgeSeconds,
  };
}
