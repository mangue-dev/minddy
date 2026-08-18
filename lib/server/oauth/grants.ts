import "server-only";

import { randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import {
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  generateSecret,
  sha256Hex,
} from "@/lib/server/oauth/crypto";
import type { OAuthClient } from "@/lib/server/oauth/clients";
import { mapClientNameToAgent } from "@/lib/mcp-agents";
import { afterOrNow } from "@/lib/server/after-safe";

/**
 * OAuth grants: one line active per (user × client), opaque tokens
 * rotated in place. Each grant is backed by a line api_keys
 * “actor” (name = client_name, mapped agent) whose key_hash is the
 * sha256 of a random secret NEVER revealed (satisfied NOT NULL + UNIQUE),
 * bearer of the existing timeline attribution (api_key_id).
 */

const ACCESS_TTL_MS = 3600_000; // 1 h
const REFRESH_TTL_MS = 90 * 24 * 3600_000; // 90 j glissants

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export interface GrantSummary {
  id: string;
  client_id: string;
  client_name: string;
  agent: string | null;
  scope: string;
  created_at: string;
  last_used_at: string | null;
}

/** Active grant for (user, client) — reused if it exists, otherwise created with
 its line api_keys actor. Called at the time of consent. */
export async function ensureGrantWithActorKey({
  userId,
  client,
}: {
  userId: string;
  client: OAuthClient;
}): Promise<{ grantId: string } | null> {
  const service = getServiceClient();

  const { data: existing } = await service
    .from("oauth_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("client_id", client.client_id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing) return { grantId: existing.id as string };

  // Actor line: key_hash of a secret never revealed (satisfied NOT NULL +
  // UNIQUE without ever being able to authenticate), hidden from settings via
  // oauth_client_id.
  const { data: actorKey, error: keyError } = await service
    .from("api_keys")
    .insert({
      user_id: userId,
      name: client.client_name,
      agent: mapClientNameToAgent(client.client_name),
      key_hash: sha256Hex(randomBytes(32).toString("base64url")),
      key_prefix: "oauth",
      oauth_client_id: client.client_id,
    })
    .select("id")
    .single();
  if (keyError) {
    console.error("[oauth/grants] actor key failed:", keyError.message);
    return null;
  }

  const { data: grant, error: grantError } = await service
    .from("oauth_grants")
    .insert({
      user_id: userId,
      client_id: client.client_id,
      api_key_id: actorKey.id,
    })
    .select("id")
    .single();
  if (grantError) {
    console.error("[oauth/grants] grant failed:", grantError.message);
    return null;
  }

  const usedAt = new Date().toISOString();
  afterOrNow(async () => {
    const { error } = await service
      .from("oauth_clients")
      .update({ last_used_at: usedAt })
      .eq("client_id", client.client_id);
    if (error) console.error("[oauth/grants] client last_used:", error.message);
  });

  return { grantId: grant.id as string };
}

/** Issues a new access/refresh pair for the grant (code exchange). */
export async function issueTokens(grantId: string): Promise<TokenPair | null> {
  const service = getServiceClient();
  const access = generateSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateSecret(REFRESH_TOKEN_PREFIX);
  const now = Date.now();

  const { data, error } = await service
    .from("oauth_grants")
    .update({
      access_token_hash: access.hash,
      access_token_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      refresh_token_hash: refresh.hash,
      refresh_token_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
      prev_refresh_token_hash: null,
      last_used_at: new Date(now).toISOString(),
    })
    .eq("id", grantId)
    .is("revoked_at", null)
    .select("scope");
  if (error) {
    console.error("[oauth/grants] issue failed:", error.message);
    return null;
  }
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    accessToken: access.value,
    refreshToken: refresh.value,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    scope: row.scope as string,
  };
}

/** Atomic rotation of the refresh token: the swap is keyed on the OLD hash,
 so only one concurrent rotation wins. Expiry sliding +90 days.

 The `client_id` is part of the key (RFC 6749 §6: the public client presents it, §10.4: the server must bind the token to its client). Without it,
 any registered client — and registration is open — exchanges
 another's refresh token as soon as it intercepts one. */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string
): Promise<TokenPair | null> {
  const service = getServiceClient();
  const oldHash = sha256Hex(refreshToken);
  const access = generateSecret(ACCESS_TOKEN_PREFIX);
  const refresh = generateSecret(REFRESH_TOKEN_PREFIX);
  const now = Date.now();

  const { data, error } = await service
    .from("oauth_grants")
    .update({
      access_token_hash: access.hash,
      access_token_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      refresh_token_hash: refresh.hash,
      refresh_token_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
      prev_refresh_token_hash: oldHash,
      last_used_at: new Date(now).toISOString(),
    })
    .eq("refresh_token_hash", oldHash)
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .gt("refresh_token_expires_at", new Date(now).toISOString())
    .select("scope");
  if (error) {
    console.error("[oauth/grants] rotate failed:", error.message);
    return null;
  }
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    accessToken: access.value,
    refreshToken: refresh.value,
    expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
    scope: row.scope as string,
  };
}

/** Replay of a rotated refresh token (N-1 generation): the entire grant is revoked — a third party perhaps holds the current pair (RFC 9700 §4.14).
 Also linked to the client: revocation is a weapon, and the grant of one client is not within the reach of another. */
export async function handleRefreshReuse(
  refreshToken: string,
  clientId: string
): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("oauth_grants")
    .select("id, user_id, api_key_id")
    .eq("prev_refresh_token_hash", sha256Hex(refreshToken))
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return false;

  console.warn(
    `[oauth/grants] refresh token reuse detected — revoking grant ${data.id}`
  );
  await revokeGrantById(data.id as string, data.api_key_id as string);
  return true;
}

/** Checks an access token mdyat_… → { userId, keyId } for AuthInfo. */
export async function verifyOAuthAccessToken(
  token: string
): Promise<{ userId: string; keyId: string } | null> {
  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data } = await service
    .from("oauth_grants")
    .select("id, user_id, api_key_id, access_token_expires_at, api_keys!inner(revoked_at)")
    .eq("access_token_hash", sha256Hex(token))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return null;
  if (!data.access_token_expires_at || data.access_token_expires_at <= now) return null;
  const actorKey = data.api_keys as unknown as { revoked_at: string | null };
  if (actorKey?.revoked_at) return null;

  // A usual timestamp does not delay the request: it leaves AFTER the response,
  // but attached to the invocation - detached, he would die in the frost of the lambda.
  afterOrNow(async () => {
    const [grant, key] = await Promise.all([
      service.from("oauth_grants").update({ last_used_at: now }).eq("id", data.id),
      service.from("api_keys").update({ last_used_at: now }).eq("id", data.api_key_id),
    ]);
    if (grant.error) console.error("[oauth/grants] last_used_at:", grant.error.message);
    if (key.error) console.error("[oauth/grants] key last_used_at:", key.error.message);
  });

  return { userId: data.user_id as string, keyId: data.api_key_id as string };
}

export async function listGrantsForUser(
  userId: string
): Promise<GrantSummary[] | null> {
  const { data, error } = await getServiceClient()
    .from("oauth_grants")
    .select(
      "id, client_id, scope, created_at, last_used_at, oauth_clients(client_name), api_keys(agent)"
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[oauth/grants] list failed:", error.message);
    return null;
  }
  return (data ?? []).map((g) => ({
    id: g.id as string,
    client_id: g.client_id as string,
    client_name:
      ((g.oauth_clients as unknown as { client_name: string } | null)?.client_name ??
        "MCP client"),
    agent: ((g.api_keys as unknown as { agent: string | null } | null)?.agent ?? null),
    scope: g.scope as string,
    created_at: g.created_at as string,
    last_used_at: (g.last_used_at as string | null) ?? null,
  }));
}

async function revokeGrantById(grantId: string, apiKeyId: string): Promise<void> {
  const service = getServiceClient();
  const now = new Date().toISOString();
  await service
    .from("oauth_grants")
    .update({ revoked_at: now })
    .eq("id", grantId)
    .is("revoked_at", null);
  await service
    .from("api_keys")
    .update({ revoked_at: now })
    .eq("id", apiKeyId)
    .is("revoked_at", null);
}

/** Revocation by the owner (settings → Connected applications). */
export async function revokeGrant({
  userId,
  grantId,
}: {
  userId: string;
  grantId: string;
}): Promise<
  | { ok: true }
  | { ok: false; status: number; errorKey: "grantNotFound" | "databaseError" }
> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("oauth_grants")
    .select("id, api_key_id")
    .eq("id", grantId)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[oauth/grants] revoke lookup failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "grantNotFound" };

  await revokeGrantById(data.id as string, data.api_key_id as string);
  return { ok: true };
}
