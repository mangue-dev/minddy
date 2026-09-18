import "server-only";

import { randomBytes } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";
import {
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
  deriveRefreshSuccessor,
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

const ACCESS_TTL_MS = 30 * 24 * 3600_000; // 30 days
const REFRESH_TTL_MS = 90 * 24 * 3600_000; // 90 days, sliding
/** Benign double-refresh window (MIN-558): MCP clients fly several requests in
 * parallel, and more than one can cross the access-token expiry and refresh
 * with the SAME token. Inside this window an N-1 presentation is treated as a
 * concurrent retry — it re-issues the same successor instead of revoking the
 * grant. Outside it, an N-1 replay is still a breach signal (RFC 9700
 * §4.14.2). Far below the access TTL, so the replay-detection window stays
 * tight. */
const REFRESH_GRACE_MS = 120_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

/** Result of a refresh-token grant (MIN-558). */
export type RefreshRotation =
  | { ok: true; pair: TokenPair }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "reuse"; grant: { id: string; apiKeyId: string } };

/** The joined row a refresh lookup needs. `key_hash` is the HMAC key of the
 * successor derivation; `revoked_at` of the actor key is checked in code so
 * the request fails cleanly instead of issuing dead tokens. */
interface RefreshGrantRow {
  id: string;
  user_id: string;
  api_key_id: string;
  scope: string;
  access_token_expires_at: string | null;
  api_keys: { key_hash: string; revoked_at: string | null } | null;
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

/** Atomic rotation of the refresh token, resilient to concurrent refreshes
 * (MIN-558). The successor is DETERMINISTIC (HMAC keyed by the grant's actor
 * key hash): every request presenting the same current token receives the
 * same new pair, so parallel refreshes converge instead of orphaning each
 * other. The `client_id` is part of the key (RFC 6749 §6: the public client
 * presents it, §10.4: the server must bind the token to its client). Without
 * it, any registered client — and registration is open — exchanges another's
 * refresh token as soon as it intercepts one.
 *
 * Three outcomes:
 * 1. the presented token is the current one → rotate to its successor;
 * 2. the presented token is the N-1 one, inside the grace window → the
 *    successor is by construction the current token: re-issue a fresh access
 *    token and hand back the same pair. No revocation, no orphan;
 * 3. the N-1 token outside the grace window → `reuse`: a replayed rotated
 *    token is a breach signal, the caller revokes the entire grant
 *    (RFC 9700 §4.14.2). Any other miss → `invalid`, which proves nothing
 *    and revokes nothing. */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string
): Promise<RefreshRotation> {
  const service = getServiceClient();
  const oldHash = sha256Hex(refreshToken);
  const now = Date.now();

  // 1) Current token: rotate to its deterministic successor. The guard on the
  // old hash makes the swap atomic — only one concurrent rotation wins; the
  // losers fall through to the grace path below.
  const { data: current, error: currentError } = await service
    .from("oauth_grants")
    .select(
      "id, user_id, api_key_id, scope, access_token_expires_at, api_keys!inner(key_hash, revoked_at)"
    )
    .eq("refresh_token_hash", oldHash)
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .gt("refresh_token_expires_at", new Date(now).toISOString())
    .maybeSingle();
  if (currentError) {
    console.error("[oauth/grants] rotate lookup failed:", currentError.message);
    return { ok: false, reason: "invalid" };
  }
  const currentRow = current as unknown as RefreshGrantRow | null;
  const currentActor = currentRow?.api_keys ?? null;
  if (currentRow && currentActor && !currentActor.revoked_at) {
    const successor = deriveRefreshSuccessor(currentActor.key_hash, refreshToken);
    const access = generateSecret(ACCESS_TOKEN_PREFIX);
    const { data, error } = await service
      .from("oauth_grants")
      .update({
        access_token_hash: access.hash,
        access_token_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
        refresh_token_hash: successor.hash,
        refresh_token_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
        prev_refresh_token_hash: oldHash,
        last_used_at: new Date(now).toISOString(),
      })
      .eq("id", currentRow.id)
      .eq("refresh_token_hash", oldHash)
      .is("revoked_at", null)
      .select("scope");
    if (error) {
      console.error("[oauth/grants] rotate failed:", error.message);
      return { ok: false, reason: "invalid" };
    }
    const row = (data ?? [])[0];
    if (row) {
      return {
        ok: true,
        pair: {
          accessToken: access.value,
          refreshToken: successor.value,
          expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
          scope: row.scope as string,
        },
      };
    }
    // Lost a concurrent rotation: the presented token is now the N-1 one and
    // the grace path re-issues the same successor.
  }

  // 2) N-1 replay. Inside the grace window this is a concurrent retry, not a
  // breach: the invariant of every rotation is refresh_token_hash ==
  // sha256(successor(prev)), so re-issuing `successor(presented)` hands every
  // racer the same pair and they converge.
  const { data: previous, error: previousError } = await service
    .from("oauth_grants")
    .select(
      "id, user_id, api_key_id, scope, access_token_expires_at, api_keys!inner(key_hash, revoked_at)"
    )
    .eq("prev_refresh_token_hash", oldHash)
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .maybeSingle();
  if (previousError) {
    console.error("[oauth/grants] rotate replay lookup failed:", previousError.message);
    return { ok: false, reason: "invalid" };
  }
  const previousRow = previous as unknown as RefreshGrantRow | null;
  const previousActor = previousRow?.api_keys ?? null;
  if (!previousRow || !previousActor || previousActor.revoked_at) {
    return { ok: false, reason: "invalid" };
  }
  // Every rotation and code exchange stamps access_token_expires_at with
  // `rotation time + ACCESS_TTL_MS` — the only reliable trace of when the
  // rotation happened (last_used_at moves with access-token checks too).
  const rotatedAt = previousRow.access_token_expires_at
    ? Date.parse(previousRow.access_token_expires_at) - ACCESS_TTL_MS
    : NaN;
  if (!Number.isFinite(rotatedAt) || now - rotatedAt > REFRESH_GRACE_MS) {
    // Outside the grace window, replaying a rotated token means a second
    // party holds the current pair — revoke the whole grant.
    return {
      ok: false,
      reason: "reuse",
      grant: { id: previousRow.id, apiKeyId: previousRow.api_key_id },
    };
  }
  const successor = deriveRefreshSuccessor(previousActor.key_hash, refreshToken);
  const access = generateSecret(ACCESS_TOKEN_PREFIX);
  const { data, error } = await service
    .from("oauth_grants")
    .update({
      access_token_hash: access.hash,
      access_token_expires_at: new Date(now + ACCESS_TTL_MS).toISOString(),
      last_used_at: new Date(now).toISOString(),
    })
    // The invariant guard: if the grant moved past this successor, we are
    // not who we think — a plain miss, never a revocation.
    .eq("id", previousRow.id)
    .eq("refresh_token_hash", successor.hash)
    .is("revoked_at", null)
    .select("scope");
  if (error) {
    console.error("[oauth/grants] rotate re-issue failed:", error.message);
    return { ok: false, reason: "invalid" };
  }
  const row = (data ?? [])[0];
  if (!row) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    pair: {
      accessToken: access.value,
      refreshToken: successor.value,
      expiresIn: Math.floor(ACCESS_TTL_MS / 1000),
      scope: row.scope as string,
    },
  };
}

/** Replay of a rotated refresh token OUTSIDE the grace window (RFC 9700
 * §4.14.2): the entire grant is revoked — a third party perhaps holds the
 * current pair. Also linked to the client: revocation is a weapon, and the
 * grant of one client is not within the reach of another. */
export async function revokeGrantForReuse(grant: {
  id: string;
  apiKeyId: string;
}): Promise<void> {
  await revokeGrantById(grant.id, grant.apiKeyId);
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
