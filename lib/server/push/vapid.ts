import "server-only";

import webpush from "web-push";

/**
 * The server's VAPID configuration — the identity that signs each Web Push
 * (MIN-183).
 *
 * Everything starts from here because everything must be able to TURN OFF here: locally without
 * keys, in preview on a branch that doesn't have any, the app should continue to run and the inbox should fill. `isPushConfigured()` is therefore the
 * short circuit that the sending chain consults before doing anything —
 * not a startup `throw`, not a `!` on `process.env`.
 *
 * `setVapidDetails` is a MODULE state in `web-push`: calling it every
 * send would be a global rewrite per request. The flag below the
 * reduces to once per instance, like the singleton in lib/supabase-service.ts
 * — and under Fluid Compute, because the instance is reused, it's once for
 * many sends.
 */

/** The contact that the push service sees pass — `mailto:` or `https:`, the
 * RFC 8292 does not admit anything else. An incorrect value would cause ALL
 * sendings to fail: the capacity is then deactivated. */
function vapidSubject(): string | null {
  const raw = process.env.VAPID_SUBJECT?.trim();
  if (!raw) return null;
  if (raw.startsWith("mailto:") || raw.startsWith("https://")) return raw;
  console.error(
    `[push] VAPID_SUBJECT invalide (${raw}) — attendu mailto: ou https: ; Web Push désactivé`
  );
  return null;
}

/** True when the key pair is there. Everything else in the sending chain en
 * depends: false → silent no-op, never an exception. */
export function isPushConfigured(): boolean {
  return (
    !!process.env.MINDDY_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
    !!process.env.VAPID_PRIVATE_KEY?.trim() &&
    !!vapidSubject()
  );
}

let configured = false;

/**
 * Arms `web-push` with the VAPID pair, once per instance. Returns `false` when
 * there is nothing to arm — the caller stops there.
 */
export function configureWebPush(): boolean {
  // The presence of the keys is REVERIFIED at each call, before the flag: the
  // flag only says “`setVapidDetails` has already been called”, never “the
  //push is on.” Switching them would make an instance respond `true`
  // whose keys have disappeared from the environment, and their own extinction — the
  // contract of this file — would only hold when restarting the process.
  if (!isPushConfigured()) return false;
  if (configured) return true;
  try {
    webpush.setVapidDetails(
      vapidSubject()!,
      process.env.MINDDY_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    configured = true;
    return true;
  } catch (e) {
    // A poorly copied key (wrong length, base64url truncated) returns HERE, at
    // first arming, and not at each sending. We say it once and turn it off.
    console.error("[push] clés VAPID refusées:", (e as Error).message);
    return false;
  }
}
