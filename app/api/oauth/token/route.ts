import { NextResponse, type NextRequest } from "next/server";
import {
  claimAuthorizationCode,
  cleanupExpiredCodes,
  findReplayedCode,
} from "@/lib/server/oauth/codes";
import {
  handleRefreshReuse,
  issueTokens,
  rotateRefreshToken,
  type TokenPair,
} from "@/lib/server/oauth/grants";
import { verifyPkceS256 } from "@/lib/server/oauth/crypto";
import { isValidResource } from "@/lib/server/oauth/authorize-validation";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS, NO_STORE_HEADERS, corsPreflight } from "@/lib/server/oauth/cors";
import { getClientIp } from "@/lib/server/request-ip";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Endpoint token OAuth 2.1 (RFC 6749 §3.2) — public, open CORS, responses
 * jamais mises en cache. Deux grants :
 * - authorization_code + PKCE: atomic claim of the code (a replay revokes the
 *   grant — interception possible) ;
 * - refresh_token: atomic rotation, replay of an N-1 token ⇒ revocation.
 * Erreurs au format RFC 6749 §5.2, anglais simple.
 */

const HEADERS = { ...OAUTH_CORS_HEADERS, ...NO_STORE_HEADERS };

const tokenError = (error: string, description: string, status = 400) =>
  NextResponse.json(
    { error, error_description: description },
    { status, headers: HEADERS }
  );

const tokenSuccess = (pair: TokenPair) =>
  NextResponse.json(
    {
      access_token: pair.accessToken,
      token_type: "Bearer",
      expires_in: pair.expiresIn,
      refresh_token: pair.refreshToken,
      scope: pair.scope,
    },
    { status: 200, headers: HEADERS }
  );

// Public endpoint: on-body terminals (MIN-118). No legitimate value
// exceeds that (redirect_uri ≤ 2000, code_verifier ≤ 128 per RFC 7636) — a
// out-of-size field is simply ignored, and will therefore miss the grant (400).
const MAX_BODY_FIELDS = 30;
const MAX_FIELD_NAME_CHARS = 100;
const MAX_FIELD_CHARS = 2048;

/** form-urlencoded (spec) — also tolerates a JSON body (lax clients). */
async function parseBody(request: NextRequest): Promise<Record<string, string> | null> {
  const contentType = request.headers.get("content-type") ?? "";
  const keep = (key: string, value: unknown): value is string =>
    key.length <= MAX_FIELD_NAME_CHARS &&
    typeof value === "string" &&
    value.length <= MAX_FIELD_CHARS;
  try {
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(json)
          .filter(([k, v]) => keep(k, v))
          .slice(0, MAX_BODY_FIELDS)
      ) as Record<string, string>;
    }
    const form = await request.formData();
    const out: Record<string, string> = {};
    let count = 0;
    for (const [key, value] of form.entries()) {
      if (!keep(key, value)) continue;
      if (++count > MAX_BODY_FIELDS) break;
      out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const rate = checkSessionRateLimit(`ip:${getClientIp(request)}`, "oauth:token", {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Rate limit exceeded." },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfter) } }
    );
  }

  const body = await parseBody(request);
  if (!body) return tokenError("invalid_request", "Malformed request body.");

  try {
    if (body.grant_type === "authorization_code") {
      return await handleAuthorizationCode(request, body);
    }
    if (body.grant_type === "refresh_token") {
      return await handleRefreshToken(body);
    }
    return tokenError(
      "unsupported_grant_type",
      "Supported grant types: authorization_code, refresh_token."
    );
  } finally {
    cleanupExpiredCodes();
  }
}

async function handleAuthorizationCode(
  request: NextRequest,
  body: Record<string, string>
): Promise<NextResponse> {
  const { code, code_verifier, client_id, redirect_uri, resource } = body;
  if (!code || !code_verifier) {
    return tokenError("invalid_request", "code and code_verifier are required.");
  }

  const claimed = await claimAuthorizationCode(code);
  if (!claimed) {
    // Unknown/expired code… or already consumed: in the latter case, revoke
    // the linked grant (RFC 6749 §4.1.2 — possible interception).
    const replayedGrantId = await findReplayedCode(code);
    if (replayedGrantId) {
      console.warn(
        `[oauth/token] authorization code replay — revoking grant ${replayedGrantId}`
      );
      const service = getServiceClient();
      const { data: grant } = await service
        .from("oauth_grants")
        .select("id, api_key_id")
        .eq("id", replayedGrantId)
        .maybeSingle();
      if (grant) {
        const now = new Date().toISOString();
        await service.from("oauth_grants").update({ revoked_at: now }).eq("id", grant.id);
        await service
          .from("api_keys")
          .update({ revoked_at: now })
          .eq("id", grant.api_key_id)
          .is("revoked_at", null);
      }
    }
    return tokenError("invalid_grant", "Invalid, expired or already-used code.");
  }

  if (client_id !== claimed.client_id) {
    return tokenError("invalid_grant", "client_id does not match this code.");
  }
  // redirect_uri mandatory and identical to that of authorization.
  if (!redirect_uri || redirect_uri !== claimed.redirect_uri) {
    return tokenError("invalid_grant", "redirect_uri does not match this code.");
  }
  if (!verifyPkceS256(code_verifier, claimed.code_challenge)) {
    return tokenError("invalid_grant", "PKCE verification failed.");
  }
  // The expected origin comes from the environment, never from the request: it is
  // the one that the `.well-known` announced.
  const origin = oauthIssuer();
  if (resource !== undefined && !isValidResource(resource, origin)) {
    return tokenError("invalid_target", `The resource parameter must be ${origin}/api/mcp.`);
  }

  const pair = await issueTokens(claimed.grant_id);
  if (!pair) return tokenError("invalid_grant", "Grant has been revoked.");
  // Analytics (MIN-78): an agent has just connected to the MCP for the first
  // times (the exchange of the code only takes place once per authorization — the
  // reconnections go through refresh_token). The customer name is declarative,
  // but this is the only way to know WHICH agents are using minddy.
  captureServerEvent({
    distinctId: claimed.user_id ?? "oauth:unknown",
    event: "oauth_grant_created",
    properties: { client_id, scope: pair.scope },
  });
  return tokenSuccess(pair);
}

async function handleRefreshToken(
  body: Record<string, string>
): Promise<NextResponse> {
  const { refresh_token, client_id } = body;
  if (!refresh_token) {
    return tokenError("invalid_request", "refresh_token is required.");
  }
  // RFC 6749 §6: a public client presents its client_id. We demand it, because
  // that this is what links the token to its client — without it, any client
  // registered exchanges the refresh token of another.
  if (!client_id) {
    return tokenError("invalid_request", "client_id is required.");
  }

  const pair = await rotateRefreshToken(refresh_token, client_id);
  if (pair) return tokenSuccess(pair);

  // Missed rotation: replay of an N-1 token ⇒ revocation of the entire grant.
  await handleRefreshReuse(refresh_token, client_id);
  return tokenError("invalid_grant", "Invalid, expired or rotated refresh token.");
}

export const OPTIONS = corsPreflight;
