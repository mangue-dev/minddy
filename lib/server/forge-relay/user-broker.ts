import "server-only";

import crypto from "node:crypto";

import { getServiceClient } from "@/lib/supabase-service";
import { requireSecret } from "@/lib/server/env-secrets";
import {
  encryptForgeToken,
  decryptForgeToken,
} from "@/lib/server/git/token-crypto";
import type { GithubUserTokenSet } from "@/lib/server/git/github-user-auth";
import type { GithubUserAccount } from "@/lib/server/git/github-user-auth";
import { recordRefreshLineage } from "./refresh-broker";

/**
 * GitHub user-authorization broker (docs/managed-forge-relay-plan.md,
 * "User authorization (human gestures)").
 *
 * The official app's *User authorization callback URL* is fixed and points at
 * Cloud, so a relayed instance cannot run the per-user OAuth dance itself
 * (MIN-144). Three beats:
 *
 * 1. INSTANCE — `signRelayUserState`: the user is redirected to Cloud's
 *    `/api/relay/github/user-authorize` with an Ed25519-signed state carrying
 *    the minddy userId, the return origin, and the instance callback origin.
 *    Cloud holds only the instance's PUBLIC key, so this state is unfalsifiable.
 * 2. CLOUD — runs the standard OAuth exchange with its registered callback
 *    URL, then parks the token set in `forge_relay_user_deliveries` (encrypted,
 *    single consumption, short TTL) and sends the user's browser back to the
 *    instance with a random delivery id.
 * 3. INSTANCE — `GET /api/git/github/relay-user-callback` retrieves the
 *    delivery over the already-authenticated relay channel and stores the
 *    identity exactly like the local flow (`upsertUserIdentity`). User tokens
 *    KEEP living on the instance; Cloud sees each token once, transiently.
 */

const USER_STATE_MAX_AGE_MS = 10 * 60_000;
const CLOCK_SKEW_TOLERANCE_MS = 60_000;
/** How long a delivered-but-unfetched delivery stays readable by its instance. */
const DELIVERY_RESULT_TTL_MS = 60 * 60_000;

export const RELAY_USER_STATE_KIND = "forge-relay-user-authorize";

interface RelayUserStatePayload {
  kind: typeof RELAY_USER_STATE_KIND;
  userId: string;
  /** Closed return table key ("settings" | "pr"), as in the local flow. */
  origin?: string;
  /** Instance origin the browser is sent back to. */
  callbackOrigin: string;
  iat: number;
}

// ── Instance side ───────────────────────────────────────────────────────────

/**
 * Signs the authorization request the instance redirects the user to. The
 * private key is the instance's relay signing key; Cloud verifies it against
 * the registered public key.
 */
export function signRelayUserState(input: {
  userId: string;
  origin?: string;
  callbackOrigin: string;
  privateKey: string;
  now?: number;
}): string {
  const payload: RelayUserStatePayload = {
    kind: RELAY_USER_STATE_KIND,
    userId: input.userId,
    ...(input.origin ? { origin: input.origin } : {}),
    callbackOrigin: input.callbackOrigin,
    iat: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(input.privateKey));
  return `${body}.${signature.toString("base64")}`;
}

// ── Cloud side ──────────────────────────────────────────────────────────────

interface VerifiedRelayUserState {
  instanceId: string;
  instanceName: string;
  userId: string;
  origin?: string;
  callbackOrigin: string;
}

function cloudSign(body: string): string {
  return crypto
    .createHmac("sha256", requireSecret("GIT_STATE_SECRET"))
    .update(body)
    .digest("hex");
}

/** Signed state carried through GitHub's authorize redirect (Cloud → GitHub → Cloud). */
export function signCloudUserState(payload: {
  instanceId: string;
  userId: string;
  origin?: string;
  callbackOrigin: string;
}): string {
  const body = Buffer.from(
    JSON.stringify({ kind: "forge-relay-user-cloud", ...payload, iat: Date.now() }),
  ).toString("base64url");
  return `${body}.${cloudSign(body)}`;
}

export function verifyCloudUserState(
  token: string | null | undefined,
): { instanceId: string; userId: string; origin?: string; callbackOrigin: string } | null {
  if (!token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const provided = Buffer.from(token.slice(dotIndex + 1));
  let computed: Buffer;
  try {
    computed = Buffer.from(cloudSign(body));
  } catch {
    return null;
  }
  if (provided.length !== computed.length) return null;
  if (!crypto.timingSafeEqual(provided, computed)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      kind?: string;
      instanceId?: string;
      userId?: string;
      origin?: string;
      callbackOrigin?: string;
      iat?: number;
    };
    if (
      payload.kind !== "forge-relay-user-cloud" ||
      typeof payload.instanceId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.callbackOrigin !== "string" ||
      typeof payload.iat !== "number" ||
      Date.now() - payload.iat > USER_STATE_MAX_AGE_MS ||
      payload.iat - Date.now() > CLOCK_SKEW_TOLERANCE_MS
    ) {
      return null;
    }
    return {
      instanceId: payload.instanceId,
      userId: payload.userId,
      ...(payload.origin ? { origin: payload.origin } : {}),
      callbackOrigin: payload.callbackOrigin,
    };
  } catch {
    return null;
  }
}

/**
 * Verifies an instance-signed authorization state for ANY brokered flow
 * (GitHub or GitLab): known ACTIVE instance, valid Ed25519 signature against
 * its registered public key, fresh timestamp, expected kind.
 */
export async function verifyInstanceSignedState(
  instanceId: string | null | undefined,
  token: string | null | undefined,
  expectedKind: string,
): Promise<VerifiedRelayUserState | null> {
  if (!instanceId || !token) return null;
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;
  const body = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const supabase = getServiceClient();
  const { data: instance } = await supabase
    .from("forge_relay_instances")
    .select("id, name, public_key, status")
    .eq("id", instanceId)
    .maybeSingle();
  const row = instance as
    | { id: string; name: string; public_key: string; status: string }
    | null;
  if (!row || row.status !== "active") return null;

  let payload: RelayUserStatePayload;
  try {
    const valid = crypto.verify(
      null,
      Buffer.from(body),
      crypto.createPublicKey(row.public_key),
      Buffer.from(signature, "base64"),
    );
    if (!valid) return null;
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as RelayUserStatePayload;
  } catch {
    return null;
  }
  if (
    payload.kind !== expectedKind ||
    typeof payload.userId !== "string" ||
    !payload.userId ||
    typeof payload.callbackOrigin !== "string" ||
    !/^https?:\/\//.test(payload.callbackOrigin) ||
    typeof payload.iat !== "number" ||
    Date.now() - payload.iat > USER_STATE_MAX_AGE_MS ||
    payload.iat - Date.now() > CLOCK_SKEW_TOLERANCE_MS
  ) {
    return null;
  }
  return {
    instanceId: row.id,
    instanceName: row.name,
    userId: payload.userId,
    ...(payload.origin ? { origin: payload.origin } : {}),
    callbackOrigin: payload.callbackOrigin,
  };
}

/** GitHub-flavored wrapper. */
export async function verifyRelayUserState(
  instanceId: string | null | undefined,
  token: string | null | undefined,
): Promise<VerifiedRelayUserState | null> {
  return verifyInstanceSignedState(instanceId, token, RELAY_USER_STATE_KIND);
}

// ── Deliveries ──────────────────────────────────────────────────────────────

export interface RelayUserDelivery {
  userId: string;
  account: Pick<GithubUserAccount, "id" | "login" | "avatarUrl">;
  tokens: GithubUserTokenSet;
}

/** Parks a brokered token set for ONE consumption by its instance. */
export async function createUserDelivery(input: {
  instanceId: string;
  provider?: "github" | "gitlab";
  delivery: RelayUserDelivery;
}): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("forge_relay_user_deliveries")
    .insert({
      instance_id: input.instanceId,
      provider: input.provider ?? "github",
      user_id: input.delivery.userId,
      provider_account_id: String(input.delivery.account.id),
      account_login: input.delivery.account.login || null,
      account_avatar_url: input.delivery.account.avatarUrl ?? null,
      access_token_encrypted: encryptForgeToken(input.delivery.tokens.accessToken),
      refresh_token_encrypted: input.delivery.tokens.refreshToken
        ? encryptForgeToken(input.delivery.tokens.refreshToken)
        : null,
      token_expires_at: input.delivery.tokens.expiresAt,
      oauth_scopes: input.delivery.tokens.scope,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to record user delivery");
  // Lineage for the later relay-brokered refreshes of this pair
  // (docs/managed-forge-relay-plan.md): only tokens Cloud handed to THIS
  // instance are ever refreshable through it.
  await recordRefreshLineage({
    instanceId: input.instanceId,
    provider: input.provider ?? "github",
    providerAccountId: String(input.delivery.account.id),
    refreshToken: input.delivery.tokens.refreshToken ?? null,
  });
  return data.id as string;
}

export type DeliveryResult =
  | { status: "pending" }
  | { status: "delivered"; delivery: RelayUserDelivery };

/**
 * The instance's fetch. Reads are idempotent for the SAME instance (a network
 * retry after a successful consume must not lose the tokens); the first
 * successful read marks the delivery consumed.
 */
export async function consumeUserDelivery(input: {
  instanceId: string;
  deliveryId: string;
  /** When set, a delivery of another provider reads as pending. */
  provider?: "github" | "gitlab";
}): Promise<DeliveryResult> {
  const supabase = getServiceClient();
  let query = supabase
    .from("forge_relay_user_deliveries")
    .select(
      "id, status, user_id, provider_account_id, account_login, account_avatar_url, access_token_encrypted, refresh_token_encrypted, token_expires_at, oauth_scopes, created_at",
    )
    .eq("instance_id", input.instanceId)
    .eq("id", input.deliveryId);
  if (input.provider) query = query.eq("provider", input.provider);
  const { data } = await query.maybeSingle();
  const row = data as {
    id: string;
    status: string;
    user_id: string;
    provider_account_id: string;
    account_login: string | null;
    account_avatar_url: string | null;
    access_token_encrypted: string;
    refresh_token_encrypted: string | null;
    token_expires_at: string | null;
    oauth_scopes: string | null;
    created_at: string;
  } | null;
  if (!row) return { status: "pending" };

  const accessToken = decryptForgeToken(row.access_token_encrypted);
  // Expired window or undecryptable content: report pending rather than hand
  // out something unusable.
  if (
    !accessToken ||
    Date.now() - Date.parse(row.created_at) > DELIVERY_RESULT_TTL_MS
  ) {
    return { status: "pending" };
  }

  if (row.status !== "delivered") {
    await supabase
      .from("forge_relay_user_deliveries")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  return {
    status: "delivered",
    delivery: {
      userId: row.user_id,
      account: {
        id: Number(row.provider_account_id),
        login: row.account_login ?? "",
        avatarUrl: row.account_avatar_url,
      },
      tokens: {
        accessToken,
        refreshToken: row.refresh_token_encrypted
          ? decryptForgeToken(row.refresh_token_encrypted)
          : null,
        expiresAt: row.token_expires_at,
        scope: row.oauth_scopes,
      },
    },
  };
}

/** Opportunistic housekeeping, same pattern as the other throttle tables. */
export async function pruneExpiredUserDeliveries(): Promise<void> {
  if (Math.random() >= 0.01) return;
  await getServiceClient()
    .from("forge_relay_user_deliveries")
    .delete()
    .lt("created_at", new Date(Date.now() - DELIVERY_RESULT_TTL_MS).toISOString());
}
