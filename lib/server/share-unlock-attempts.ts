import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { afterOrNow } from "@/lib/server/after-safe";
import { sha256Hex } from "@/lib/server/oauth/crypto";

/**
 * The failure counter of a protected share — PERSISTENT (MIN-347).
 *
 * `checkSessionRateLimit` remains the first line: it is free and cuts
 * the pounding before any request. But it lives in memory, so by
 * instance, and starts from zero with each deployment — on an anonymous door whose only secret is a password, it's a brake that you just have to wait for.
 * This module counts in base, as the OTP of the public board already does.
 *
 * Two ceilings, because there are two ways to scan:
 * - BY ORIGIN, tight: this is the common case, a machine that tries ;
 * - BY SHARING, wide: distributed scanning. Large because that ceiling
 * closes the door to EVERYONE, including legitimate visitors — it's
 * placed above what an entire team can miss in an hour, and it
 * falls by itself an hour later.
 *
 * A successful unlocking erases failures from its origin: making a mistake twice before finding leaves no debt.
 */

/** Window of the two counters. */
const WINDOW_MS = 60 * 60 * 1000;
/** Failures tolerated by origin and by sharing, on the window. */
const MAX_PER_IP = 10;
/** Failures tolerated on a share, all origins combined. */
const MAX_PER_SHARE = 100;

/** Original fingerprint, never the clear IP — same salt as `feedback_otp_codes`. */
function hashIp(ip: string): string {
  return sha256Hex(
    `share-unlock-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`
  );
}

/**
 * Are there any tests left? Reads both counters in one pass.
 *
 * Never RAISES: a base that responds poorly must not transform a public
 * page into 500. We let it pass — the limit in memory, it always holds
 *, and scrypt is in front anyway.
 */
export async function shareUnlockAttemptsLeft(
  shareId: string,
  ip: string
): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  try {
    // In the `try`: on an incomplete configuration, `getServiceClient` raises,
    // and it should not be seen in 500 on a public page.
    const service = getServiceClient();
    const [byIp, byShare] = await Promise.all([
      service
        .from("share_unlock_attempts")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId)
        .eq("ip_hash", hashIp(ip))
        .gte("created_at", since),
      service
        .from("share_unlock_attempts")
        .select("id", { count: "exact", head: true })
        .eq("share_id", shareId)
        .gte("created_at", since),
    ]);
    return (byIp.count ?? 0) < MAX_PER_IP && (byShare.count ?? 0) < MAX_PER_SHARE;
  } catch (e) {
    console.error("[share-unlock] attempt count failed:", (e as Error).message);
    return true;
  }
}

/**
 * Stores a failure, and purges what came out of the window.
 *
 * Off the critical path, therefore by `afterOrNow`: the response leaves without waiting,
 * but the invocation remains alive for the duration of the writing. Detaching the promise
 * would cause it to die in flight, and the counter would count nothing.
 */
export function recordShareUnlockFailure(shareId: string, ip: string): void {
  const ipHash = hashIp(ip);
  afterOrNow(async () => {
    const service = getServiceClient();
    const { error } = await service
      .from("share_unlock_attempts")
      .insert({ share_id: shareId, ip_hash: ipHash });
    if (error) console.error("[share-unlock] attempt insert failed:", error.message);

    const { error: purgeError } = await service
      .from("share_unlock_attempts")
      .delete()
      .lt("created_at", new Date(Date.now() - WINDOW_MS).toISOString());
    if (purgeError) {
      console.error("[share-unlock] attempt purge failed:", purgeError.message);
    }
  });
}

/** The correct password wipes the slate clean from this origin. */
export function clearShareUnlockFailures(shareId: string, ip: string): void {
  const ipHash = hashIp(ip);
  afterOrNow(async () => {
    const { error } = await getServiceClient()
      .from("share_unlock_attempts")
      .delete()
      .eq("share_id", shareId)
      .eq("ip_hash", ipHash);
    if (error) console.error("[share-unlock] attempt clear failed:", error.message);
  });
}
