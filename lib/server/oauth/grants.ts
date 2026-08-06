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
 * Grants OAuth : une ligne active par (user × client), tokens opaques
 * rotationnés sur place. Chaque grant est adossé à une ligne api_keys
 * « acteur » (name = client_name, agent mappé) dont le key_hash est le
 * sha256 d'un secret aléatoire JAMAIS révélé (satisfait NOT NULL + UNIQUE),
 * porteur de l'attribution timeline existante (api_key_id).
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

/** Grant actif pour (user, client) — réutilisé s'il existe, sinon créé avec
    sa ligne api_keys acteur. Appelé au moment du consentement. */
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

  // Ligne acteur : key_hash d'un secret jamais révélé (satisfait NOT NULL +
  // UNIQUE sans jamais pouvoir s'authentifier), masquée des settings via
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

/** Émet une paire access/refresh neuve pour le grant (échange de code). */
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

/** Rotation atomique du refresh token : le swap est keyed sur l'ANCIEN hash,
    donc une seule rotation concurrente gagne. Expiry glissante +90 j. */
export async function rotateRefreshToken(
  refreshToken: string
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

/** Rejeu d'un refresh token rotationné (génération N-1) : le grant entier est
    révoqué — un tiers détient peut-être la paire courante (RFC 9700 §4.14). */
export async function handleRefreshReuse(refreshToken: string): Promise<boolean> {
  const service = getServiceClient();
  const { data } = await service
    .from("oauth_grants")
    .select("id, user_id, api_key_id")
    .eq("prev_refresh_token_hash", sha256Hex(refreshToken))
    .is("revoked_at", null)
    .maybeSingle();
  if (!data) return false;

  console.warn(
    `[oauth/grants] refresh token reuse detected — revoking grant ${data.id}`
  );
  await revokeGrantById(data.id as string, data.api_key_id as string);
  return true;
}

/** Vérifie un access token mdyat_… → { userId, keyId } pour AuthInfo. */
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

  // Un horodatage d'usage ne retarde pas la requête : il part APRÈS la réponse,
  // mais rattaché à l'invocation — détaché, il mourrait au gel de la lambda.
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

/** Révocation par le propriétaire (settings → Applications connectées). */
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
