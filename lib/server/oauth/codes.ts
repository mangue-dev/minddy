import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { CODE_PREFIX, generateSecret, sha256Hex } from "@/lib/server/oauth/crypto";
import { afterOrNow } from "@/lib/server/after-safe";
import { decodeOAuthCodeContent, encodeOAuthCodeContent,
  shouldProtectOAuthCodes, type StoredOAuthCode } from "./code-content";

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
  const protectedWrite = await shouldProtectOAuthCodes();
  const content = protectedWrite
    ? await encodeOAuthCodeContent({ code_hash: hash, user_id: userId },
        { redirect_uri: redirectUri, resource }) : null;
  const { error } = await getServiceClient().from("oauth_authorization_codes").insert({
    code_hash: hash,
    client_id: clientId,
    user_id: userId,
    grant_id: grantId,
    redirect_uri: protectedWrite ? null : redirectUri,
    code_challenge: codeChallenge,
    scope,
    resource: protectedWrite ? null : resource,
    ...content,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[oauth/codes] create failed:", error.message);
    return null;
  }
  return value;
}

export interface AuthorizationCodeExchange {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}

/**
 * Atomically consumes a code only when the public client proves every value
 * bound during authorization, including PKCE. Invalid attempts leave it usable.
 */
export async function claimAuthorizationCode(
  code: string,
  exchange: AuthorizationCodeExchange
): Promise<AuthorizationCode | null> {
  const now = new Date().toISOString();
  const service = getServiceClient();
  const hash = sha256Hex(code);
  const { data: candidate, error: readError } = await service
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code_hash", hash)
    .is("used_at", null)
    .gt("expires_at", now)
    .eq("client_id", exchange.clientId)
    .eq("code_challenge", exchange.codeChallenge)
    .maybeSingle();
  if (readError || !candidate) return null;
  const content = await decodeOAuthCodeContent(candidate as StoredOAuthCode);
  if (content.redirect_uri !== exchange.redirectUri) return null;
  let claim = service.from("oauth_authorization_codes")
    .update({ used_at: now })
    .eq("code_hash", hash).is("used_at", null)
    .gt("expires_at", now)
    .eq("client_id", exchange.clientId)
    .eq("code_challenge", exchange.codeChallenge);
  claim = candidate.encrypted_content
    ? claim.eq("encrypted_content", candidate.encrypted_content)
    : claim.eq("redirect_uri", exchange.redirectUri);
  const { data, error } = await claim.select("*").maybeSingle();
  if (error) {
    console.error("[oauth/codes] claim failed:", error.message);
    return null;
  }
  return data ? { code_hash: data.code_hash as string,
    client_id: data.client_id as string, user_id: data.user_id as string,
    grant_id: data.grant_id as string, redirect_uri: content.redirect_uri,
    code_challenge: data.code_challenge as string, scope: data.scope as string,
    resource: content.resource } : null;
}

/**
 * Returns the grant for a consumed code only after the caller proves the same
 * exchange binding. A guessed code cannot revoke somebody else's grant.
 */
export async function findReplayedCode(
  code: string,
  exchange: AuthorizationCodeExchange
): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("oauth_authorization_codes")
    .select("*")
    .eq("code_hash", sha256Hex(code))
    .not("used_at", "is", null)
    .eq("client_id", exchange.clientId)
    .eq("code_challenge", exchange.codeChallenge)
    .maybeSingle();
  if (!data) return null;
  const content = await decodeOAuthCodeContent(data as StoredOAuthCode);
  return content.redirect_uri === exchange.redirectUri
    ? data.grant_id as string : null;
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
