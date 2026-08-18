import "server-only";

import { cookies, headers } from "next/headers";

import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { clientIpFromHeaders } from "@/lib/server/request-ip";
import { isCustomPublicHost, publicCookiePath } from "@/lib/server/custom-domains";
import {
  clearShareUnlockFailures,
  recordShareUnlockFailure,
  shareUnlockAttemptsLeft,
} from "@/lib/server/share-unlock-attempts";
import {
  SHARE_UNLOCK_COOKIE,
  getPublicShareTarget,
  unlockCookieMatches,
  unlockCookieValue,
  verifySharePassword,
} from "@/lib/server/view-shares";

/**
 * UNLOCK a password-protected share — just once,
 * for all its targets (MIN-283).
 *
 * Two surfaces trigger it: a shared view's form
 * (`/share/[token]`) and of a published page (`/p/[token]`). They don't
 * share their rendering, but they share everything related to the
 * secret — the limit of attempts, the bound before scrypt, the comparison in
 * constant time, the value of the cookie. This is exactly what you should not
 * write twice: the second copy is the one that misses the next
 * correction.
 *
 * What is left for the caller: the redirection. It depends on the route, and
 * `redirect()` raises — calling it here would hide the result of this function.
 *
 * ── Two counters, not one (MIN-347) ─────────────────────────── ───────────
 *
 * The memory limit cuts the hammering for nothing, but it only sees one
 * instance and starts from scratch on each deployment: on the only door of the product
 * whose secret is a hand-chosen password, it was not a brake,
 * it was a delay. Failures are therefore stored in base
 * ([share-unlock-attempts.ts](./share-unlock-attempts.ts)), and read BEFORE scrypt.
 */

/** Key for the i18n PublicShare namespace, rendered under the form. */
export type ShareUnlockError = "wrongPassword" | "tooManyAttempts";

export type ShareUnlockResult =
  /** Unlocked (cookie set), or already public: there is nothing to unlock. */
  | { ok: true }
  | { ok: false; error: ShareUnlockError };

/** Bound before scrypt: beyond that, there's no point in deriving — it's wrong. Aligned with
 sharing PUT routes (MIN-118). */
const MAX_PASSWORD_LENGTH = 256;

export async function unlockShareWithPassword({
  token,
  password,
  cookiePath,
}: {
  token: string;
  password: unknown;
  /** Cookie path on primary host: `/share/<token>` or `/p/<token>`. A single cookie name therefore serves any number of shares. */
  cookiePath: string;
}): Promise<ShareUnlockResult> {
  // Porte anonyme : on limite par IP visiteur — celle du dernier relais de
  // trust, never the head of `x-forwarded-for` (chosen by the caller).
  const ip = clientIpFromHeaders(await headers());
  const { allowed } = checkSessionRateLimit(ip, `share-unlock:${token}`, {
    limit: 10,
  });
  if (!allowed) return { ok: false, error: "tooManyAttempts" };

  const target = await getPublicShareTarget(token);
  if (!target) return { ok: false, error: "wrongPassword" };
  const { share } = target;

  // Switched to “public” in the meantime: there is nothing more to unlock, the
  // page se re-rend telle quelle.
  if (share.level !== "password" || !share.password_salt || !share.password_hash) {
    return { ok: true };
  }

  // Second line, the one that survives deployment: failures listed in
  // base. It is read AFTER the resolution of the division — without division, there is no
  // nothing to count — but BEFORE scrypt, which is what we refuse to pay.
  if (!(await shareUnlockAttemptsLeft(share.id, ip))) {
    return { ok: false, error: "tooManyAttempts" };
  }

  if (
    typeof password !== "string" ||
    password.length > MAX_PASSWORD_LENGTH ||
    !verifySharePassword(password, share.password_salt, share.password_hash)
  ) {
    recordShareUnlockFailure(share.id, ip);
    return { ok: false, error: "wrongPassword" };
  }
  clearShareUnlockFailures(share.id, ip);

  (await cookies()).set(
    SHARE_UNLOCK_COOKIE,
    unlockCookieValue(share.token, share.password_hash),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      // On custom domain, the root: the visible path does not contain
      // never the token, and the VALUE of the cookie remains linked to this sharing.
      path: publicCookiePath(await isCustomPublicHost(), cookiePath),
      maxAge: 7 * 24 * 3600,
    }
  );
  return { ok: true };
}

/**
 * Does the visitor have the right to see THIS share?
 *
 * A “public” share is open; a “password” sharing reveals NOTHING —
 * not even the name of what it protects — as long as the cookie does not match.
 * The value of the cookie is deterministic on (token, fingerprint): changing the password
 * invalidates all cookies in circulation without holding the slightest
 * session.
 */
export async function isShareUnlocked(share: {
  level: "password" | "public";
  token: string;
  password_hash: string | null;
}): Promise<boolean> {
  if (share.level === "public") return true;
  if (!share.password_hash) return false;
  const cookie = (await cookies()).get(SHARE_UNLOCK_COOKIE)?.value;
  return unlockCookieMatches(cookie, share.token, share.password_hash);
}
