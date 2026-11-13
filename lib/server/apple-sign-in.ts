import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { getEncryptedStore } from "@/lib/server/encryption/registry";

/**
 * Sign in with Apple, server side (MIN-907): the token that account deletion
 * revokes (App Review guideline 5.1.1(v)).
 *
 * Apple revokes an authorization only from one of its tokens, and Supabase
 * keeps none: it hands Apple's refresh token to the client once, after a web
 * round, and gets none at all from the iOS app's identity-token sign-in. So
 * the server keeps one per Apple client in `apple_sign_in_tokens`, sealed with
 * the user's data key:
 * - the iOS app sends the one-time authorization code from Apple's sheet,
 *   exchanged here with the app's bundle identifier as client;
 * - a web or desktop round sends the refresh token Supabase returned, checked
 *   here against Apple with the Services ID before it is kept.
 *
 * Every call to Apple authenticates with a client secret: a short-lived ES256
 * JWT signed with the Sign in with Apple key. That key is not the APNs key.
 * The optional variables, documented in `.env.example`:
 *   APPLE_SIGN_IN_TEAM_ID, APPLE_SIGN_IN_KEY_ID, APPLE_SIGN_IN_PRIVATE_KEY,
 *   APPLE_SIGN_IN_IOS_CLIENT_ID (the app's bundle identifier),
 *   APPLE_SIGN_IN_WEB_CLIENT_ID (the Services ID).
 * Without them nothing is stored and deletion has nothing to revoke.
 */

const APPLE_ORIGIN = "https://appleid.apple.com";
const REQUEST_TIMEOUT_MS = 10_000;

export type AppleClient = "ios" | "web";

interface AppleSignInConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  clients: Partial<Record<AppleClient, string>>;
}

function readConfig(): AppleSignInConfig | null {
  const teamId = process.env.APPLE_SIGN_IN_TEAM_ID?.trim();
  const keyId = process.env.APPLE_SIGN_IN_KEY_ID?.trim();
  const privateKey = process.env.APPLE_SIGN_IN_PRIVATE_KEY?.trim();
  if (!teamId || !keyId || !privateKey) return null;
  const ios = process.env.APPLE_SIGN_IN_IOS_CLIENT_ID?.trim();
  const web = process.env.APPLE_SIGN_IN_WEB_CLIENT_ID?.trim();
  if (!ios && !web) return null;
  return {
    teamId,
    keyId,
    privateKey,
    clients: { ...(ios ? { ios } : {}), ...(web ? { web } : {}) },
  };
}

/** The Apple client identifier for `client`, or null when not configured. */
export function appleClientId(client: AppleClient): string | null {
  return readConfig()?.clients[client] ?? null;
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

/**
 * The `client_secret` Apple expects: an ES256 JWT issued by the team, for
 * `clientId`. Five minutes is enough for the one request it signs.
 */
export function appleClientSecret(clientId: string, now = Date.now()): string | null {
  const config = readConfig();
  if (!config) return null;
  const iat = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({
    iss: config.teamId,
    iat,
    exp: iat + 300,
    aud: APPLE_ORIGIN,
    sub: clientId,
  }));
  const unsigned = `${header}.${claims}`;
  try {
    const key = createPrivateKey(config.privateKey.replace(/\\n/g, "\n"));
    const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
    return `${unsigned}.${base64url(signature)}`;
  } catch {
    console.error("[apple-sign-in] private_key_refused");
    return null;
  }
}

async function postToApple(path: string, form: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE_ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/**
 * Exchanges the iOS app's authorization code for a refresh token, or checks a
 * web refresh token by using it once. Returns the refresh token to keep, or
 * null when Apple refuses.
 */
async function obtainRefreshToken(
  clientId: string,
  grant: { authorizationCode: string } | { refreshToken: string },
): Promise<string | null> {
  const secret = appleClientSecret(clientId);
  if (!secret) return null;
  const form: Record<string, string> = "authorizationCode" in grant
    ? { grant_type: "authorization_code", code: grant.authorizationCode }
    : { grant_type: "refresh_token", refresh_token: grant.refreshToken };
  const response = await postToApple("/auth/token", {
    client_id: clientId,
    client_secret: secret,
    ...form,
  });
  if (!response.ok) {
    console.error("[apple-sign-in] token_refused", { status: response.status });
    return null;
  }
  if ("refreshToken" in grant) return grant.refreshToken;
  const body = (await response.json().catch(() => null)) as { refresh_token?: unknown } | null;
  return typeof body?.refresh_token === "string" && body.refresh_token ? body.refresh_token : null;
}

function sealContext(userId: string, clientId: string) {
  return {
    scope: { kind: "user" as const, id: userId },
    table: "apple_sign_in_tokens",
    column: "encrypted_content",
    rowId: JSON.stringify([userId, clientId]),
  };
}

type StoredToken = { refreshToken: string };

/**
 * Keeps Apple's token for `userId`. `client` says which Apple client issued
 * the grant: `ios` for a code from the app, `web` for a Services ID refresh
 * token. Returns false when Apple sign-in is not configured for that client or
 * Apple refused the grant.
 */
export async function saveAppleAuthorization(
  userId: string,
  client: AppleClient,
  grant: { authorizationCode: string } | { refreshToken: string },
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  const clientId = appleClientId(client);
  if (!clientId) return false;
  const refreshToken = await obtainRefreshToken(clientId, grant);
  if (!refreshToken) return false;
  const store = getEncryptedStore();
  const ciphertext = await store.encrypt<StoredToken>({ refreshToken }, sealContext(userId, clientId));
  const { error } = await service.from("apple_sign_in_tokens").upsert({
    user_id: userId,
    client_id: clientId,
    encrypted_content: ciphertext,
    encryption_version: store.versionOf(ciphertext),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error("Unable to store the Apple authorization");
  return true;
}

export interface AppleRevocation {
  /** Tokens Apple accepted to revoke. */
  revoked: number;
  /** What failed, for the deletion's warnings. Never a token. */
  warnings: string[];
}

/**
 * Revokes every Apple authorization kept for `userId`. Called by account
 * deletion BEFORE the account goes, since the rows cascade with it. Never
 * throws: a failure becomes a warning, and the deletion continues.
 */
export async function revokeAppleAuthorizations(
  userId: string,
  service: SupabaseClient = getServiceClient(),
): Promise<AppleRevocation> {
  const result: AppleRevocation = { revoked: 0, warnings: [] };
  const { data, error } = await service
    .from("apple_sign_in_tokens")
    .select("user_id, client_id, encrypted_content, encryption_version")
    .eq("user_id", userId);
  if (error) {
    // The table is absent on an instance that has not migrated: nothing kept.
    if (!["42P01", "PGRST205"].includes(error.code ?? "")) {
      result.warnings.push(`apple: ${error.message}`);
    }
    return result;
  }

  for (const row of data ?? []) {
    const clientId = row.client_id as string;
    try {
      const store = getEncryptedStore();
      const cipher = store.fromDatabase<StoredToken>(row.encrypted_content);
      if (store.versionOf(cipher) !== row.encryption_version) throw new Error("version mismatch");
      const { refreshToken } = await store.decrypt(cipher, sealContext(userId, clientId));
      const secret = appleClientSecret(clientId);
      if (!secret) {
        result.warnings.push(`apple ${clientId}: Sign in with Apple is not configured`);
        continue;
      }
      const response = await postToApple("/auth/revoke", {
        client_id: clientId,
        client_secret: secret,
        token: refreshToken,
        token_type_hint: "refresh_token",
      });
      if (response.ok) result.revoked += 1;
      else result.warnings.push(`apple ${clientId}: revocation refused (${response.status})`);
    } catch (e) {
      result.warnings.push(`apple ${clientId}: ${(e as Error).message}`);
    }
  }
  return result;
}
