import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBackendUnavailableError } from "@/lib/backend-availability";
import { afterOrNow } from "@/lib/server/after-safe";
import { supabaseSharedFetch } from "@/lib/server/supabase-fetch";

type ClaimsOptions = NonNullable<Parameters<SupabaseClient["auth"]["getClaims"]>[1]>;
export type VerificationJwks = NonNullable<ClaimsOptions["jwks"]>;
type Refresh = { jwks: VerificationJwks } | { jwks: null; error: unknown };

/** The auth SDK's own key-set lifetime (JWKS_TTL); a set is never used longer. */
const JWKS_MAX_AGE_MS = 10 * 60 * 1000;
/** Refresh ahead of expiry so an active process never blocks on the fetch. */
const JWKS_REFRESH_AGE_MS = 8 * 60 * 1000;
/** After a failed fetch, the SDK's own lookup applies for this long. */
const JWKS_RETRY_DELAY_MS = 60 * 1000;

let keySet: { jwks: VerificationJwks; fetchedAt: number } | null = null;
let failedAt = Number.NEGATIVE_INFINITY;
let refreshing: Promise<Refresh> | null = null;

const isKey = (key: unknown): boolean => !!key && typeof key === "object" &&
  typeof (key as { kty?: unknown }).kty === "string" &&
  typeof (key as { kid?: unknown }).kid === "string";

/** Fetch the published key set once for every concurrent caller. */
function refreshJwks(): Promise<Refresh> {
  refreshing ??= (async (): Promise<Refresh> => {
    // The age counts from the request, so a slow response never extends trust.
    const fetchedAt = Date.now();
    try {
      const response = await supabaseSharedFetch(
        `${process.env.MINDDY_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
        { headers: { apikey: process.env.MINDDY_PUBLIC_SUPABASE_ANON_KEY ?? "" } },
      );
      if (!response.ok) throw Object.assign(new Error("jwks_fetch_failed"), { status: response.status });
      const keys = ((await response.json()) as { keys?: unknown } | null)?.keys;
      if (!Array.isArray(keys) || keys.length === 0 || !keys.every(isKey)) {
        throw new Error("jwks_invalid_response");
      }
      keySet = { jwks: { keys } as VerificationJwks, fetchedAt };
      return { jwks: keySet.jwks };
    } catch (error) {
      failedAt = Date.now();
      return { jwks: null, error };
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

const recentlyFailed = () => Date.now() - failedAt < JWKS_RETRY_DELAY_MS;
const refreshDue = () => !recentlyFailed() &&
  (!keySet || Date.now() - keySet.fetchedAt >= JWKS_REFRESH_AGE_MS);
// Several responses may schedule this; each rechecks so only one fetch runs.
const refreshAfterResponse = () => afterOrNow(async () => {
  if (refreshDue()) await refreshJwks();
});

/**
 * Keys for `getClaims`, or undefined to keep the SDK's own lookup. Only a set
 * fetched less than ten minutes ago is supplied; once it expires, concurrent
 * requests wait for one shared fetch. A token whose key is absent still falls
 * back to the SDK, which handles rotation. Throws when the shared fetch found
 * the backend unavailable, which the SDK reports the same way.
 */
export async function verificationJwks(): Promise<VerificationJwks | undefined> {
  if (!keySet) return undefined;
  const age = Date.now() - keySet.fetchedAt;
  if (age < JWKS_MAX_AGE_MS) {
    if (!refreshing && refreshDue()) refreshAfterResponse();
    return keySet.jwks;
  }
  if (recentlyFailed()) return undefined;
  const result = await refreshJwks();
  if (result.jwks) return result.jwks;
  if (isBackendUnavailableError(result.error)) throw result.error;
  return undefined;
}

/**
 * Start the shared key set after the response once a token verified with a
 * published key. A deployment that signs with a shared secret never fetches it.
 */
export function noteVerifiedSigningKey(header: { alg?: unknown; kid?: unknown } | undefined): void {
  if (typeof header?.alg !== "string" || header.alg.startsWith("HS") || typeof header.kid !== "string") return;
  if (!keySet && !refreshing && refreshDue()) refreshAfterResponse();
}
