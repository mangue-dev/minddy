import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { CODE_PREFIX, generateSecret, sha256Hex } from "@/lib/server/oauth/crypto";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * Single-use authorization codes (10 min). The claim is atomic
 * (UPDATE … WHERE used_at IS NULL): a replayed code no longer matches and
 * triggers the revocation of the linked grant (potential interception).
 */

const CODE_TTL_MS = 10 * 60_000;

export interface AuthorizationCode {
  code_hash: string;
  client_id: string;
  user_id: string;
  grant_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string | null;
}

export async function createAuthorizationCode({
  clientId,
  userId,
  grantId,
  redirectUri,
  codeChallenge,
  scope,
  resource,
}: {
  clientId: string;
  userId: string;
  grantId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string | null;
}): Promise<string | null> {
  const { value, hash } = generateSecret(CODE_PREFIX);
  const { error } = await getServiceClient().from("oauth_authorization_codes").insert({
    code_hash: hash,
    client_id: clientId,
    user_id: userId,
    grant_id: grantId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
    resource,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[oauth/codes] create failed:", error.message);
    return null;
  }
  return value;
}

/** Atomic Claim: marks the code used and returns it — or null if it is unknown, expired, or already consumed. */
export async function claimAuthorizationCode(
  code: string
): Promise<AuthorizationCode | null> {
  const now = new Date().toISOString();
  const { data, error } = await getServiceClient()
    .from("oauth_authorization_codes")
    .update({ used_at: now })
    .eq("code_hash", sha256Hex(code))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("code_hash, client_id, user_id, grant_id, redirect_uri, code_challenge, scope, resource")
    .maybeSingle();
  if (error) {
    console.error("[oauth/codes] claim failed:", error.message);
    return null;
  }
  return (data as unknown as AuthorizationCode) ?? null;
}

/** The code exists but has already been consumed → replay (RFC 6749 §4.1.2):
 returns the grant to be revoked. */
export async function findReplayedCode(code: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("oauth_authorization_codes")
    .select("grant_id")
    .eq("code_hash", sha256Hex(code))
    .not("used_at", "is", null)
    .maybeSingle();
  return (data?.grant_id as string) ?? null;
}

/** Opportunistic purge of codes expired for more than a day. Outside the critical path
, therefore AFTER the response — but by `afterOrNow`, otherwise the DELETE
 goes into free flight and dies when the lambda freezes (“fetch failed”). */
export function cleanupExpiredCodes(): void {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  afterOrNow(async () => {
    const { error } = await getServiceClient()
      .from("oauth_authorization_codes")
      .delete()
      .lt("expires_at", cutoff);
    if (error) console.error("[oauth/codes] cleanup:", error.message);
  });
}
