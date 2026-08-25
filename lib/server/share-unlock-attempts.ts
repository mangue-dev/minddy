import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { sha256Hex } from "@/lib/server/oauth/crypto";

/** One-hour window for both persistent password-share counters. */
const WINDOW_MS = 60 * 60 * 1000;
/** Attempts allowed from one origin for one share during the window. */
const MAX_PER_IP = 10;
/** Attempts allowed across all origins for one share during the window. */
const MAX_PER_SHARE = 100;

/** Store a keyed fingerprint, never the visitor's plaintext IP address. */
function hashIp(ip: string): string {
  return sha256Hex(
    `share-unlock-ip:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}:${ip}`
  );
}

/**
 * Reserve one password check atomically before paying the scrypt cost.
 *
 * The database function locks the share, checks both counters, and inserts the
 * reservation in one transaction. A database failure closes the password gate:
 * allowing the request would turn an outage into a distributed-limit bypass.
 */
export async function consumeShareUnlockAttempt(
  shareId: string,
  ip: string
): Promise<boolean> {
  try {
    const { data, error } = await getServiceClient().rpc(
      "consume_share_unlock_attempt",
      {
        p_share_id: shareId,
        p_ip_hash: hashIp(ip),
        p_now: new Date().toISOString(),
        p_window_seconds: Math.floor(WINDOW_MS / 1000),
        p_ip_limit: MAX_PER_IP,
        p_share_limit: MAX_PER_SHARE,
      }
    );
    if (error) {
      console.error("[share-unlock] atomic attempt failed:", error.message);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error(
      "[share-unlock] atomic attempt failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/** A correct password clears this origin's reservations for the share. */
export async function clearShareUnlockFailures(
  shareId: string,
  ip: string
): Promise<void> {
  try {
    const { error } = await getServiceClient()
      .from("share_unlock_attempts")
      .delete()
      .eq("share_id", shareId)
      .eq("ip_hash", hashIp(ip));
    if (error) console.error("[share-unlock] attempt clear failed:", error.message);
  } catch (error) {
    console.error(
      "[share-unlock] attempt clear failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
}
