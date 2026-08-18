import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  cleanupOrphanClients,
  isAllowedRedirectUri,
  registerClient,
} from "@/lib/server/oauth/clients";
import { OAUTH_CORS_HEADERS, NO_STORE_HEADERS, corsPreflight } from "@/lib/server/oauth/cors";
import { getClientIp } from "@/lib/server/request-ip";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

/**
 * Dynamic Client Registration (RFC 7591) — public, unauthenticated endpoint
 * by design: MCP clients (Claude, ChatGPT, Cursor, etc.) register
 * alone. Public clients only (auth "none"), security relies on
 * PKCE + strict redirect_uris. Errors follow RFC 7591 §3.2.2 — no i18n,
 * plain English.
 */

const HEADERS = { ...OAUTH_CORS_HEADERS, ...NO_STORE_HEADERS };

const registrationError = (code: string, description: string) =>
  NextResponse.json(
    { error: code, error_description: description },
    { status: 400, headers: HEADERS }
  );

// Public endpoint: each string and each table is bounded from the diagram
// (MIN-118) — legitimate values ​​are all well below.
const BODY_SCHEMA = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(400).optional(),
  token_endpoint_auth_method: z.string().max(50).optional(),
  grant_types: z.array(z.string().max(50)).max(10).optional(),
  response_types: z.array(z.string().max(50)).max(10).optional(),
  logo_uri: z.string().url().max(2000).optional(),
  client_uri: z.string().url().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const rate = checkSessionRateLimit(`ip:${getClientIp(request)}`, "oauth:register", {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Rate limit exceeded." },
      { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfter) } }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return registrationError("invalid_client_metadata", "Body must be JSON.");
  }
  const parsed = BODY_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    return registrationError(
      "invalid_client_metadata",
      "redirect_uris (1-10 items) is required."
    );
  }
  const body = parsed.data;

  for (const uri of body.redirect_uris) {
    if (!isAllowedRedirectUri(uri)) {
      return registrationError(
        "invalid_redirect_uri",
        `Redirect URI must be https, http on localhost/127.0.0.1, or a private-use scheme (got: ${uri.slice(0, 100)}).`
      );
    }
  }
  if (
    body.token_endpoint_auth_method !== undefined &&
    body.token_endpoint_auth_method !== "none"
  ) {
    return registrationError(
      "invalid_client_metadata",
      "Only public clients are supported (token_endpoint_auth_method must be 'none')."
    );
  }
  const allowedGrants = new Set(["authorization_code", "refresh_token"]);
  if (body.grant_types?.some((g) => !allowedGrants.has(g))) {
    return registrationError(
      "invalid_client_metadata",
      "Only authorization_code and refresh_token grant types are supported."
    );
  }
  if (body.response_types?.some((r) => r !== "code")) {
    return registrationError(
      "invalid_client_metadata",
      "Only the 'code' response type is supported."
    );
  }
  // Name: trim, strip control characters, bound the length — never rendered as HTML.
  const clientName =
    (body.client_name ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 100) || "MCP client";

  const client = await registerClient({
    clientName,
    redirectUris: body.redirect_uris,
    logoUri: body.logo_uri,
    clientUri: body.client_uri,
  });
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Registration failed." },
      { status: 500, headers: HEADERS }
    );
  }

  cleanupOrphanClients();

  return NextResponse.json(
    {
      client_id: client.client_id,
      client_id_issued_at: Math.floor(new Date(client.created_at).getTime() / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "minddy",
    },
    { status: 201, headers: HEADERS }
  );
}

export const OPTIONS = corsPreflight;
