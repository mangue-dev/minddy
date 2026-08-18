import "server-only";

import { getClient, type OAuthClient } from "@/lib/server/oauth/clients";

/**
 * Validation of the authorization request (RFC 6749 §4.1.1 + PKCE), shared
 * between the consent page (GET) and the decision route (POST — which
 * re-validates everything: hidden fields in a form are not reliable).
 *
 * Only one failure verdict, and it NEVER redirects. The RFC authorizes
 * to return a protocol error to the `redirect_uri` once it
 * is recognized (§4.1.2.1); here dynamic client registration is open to
 * everyone, so "registered URI" means nothing more than "URI that an unknown
 * filed". Making the redirection on an invalid parameter is
 * offering a permanent open redirector under our domain, triggerable by
 * a simple URL — `?response_type=x` is enough. A protocol error returns
 * therefore on our own page.
 *
 * There remains only one redirection to the client, after COMPLETE validation: the
 * decision of the user (`code`, or `error=access_denied` if it refuses).
 */

// base64url(sha256) = 43 characters; RFC terminal 43-128.
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;

export type AuthorizeParams = Partial<
  Record<
    | "client_id"
    | "redirect_uri"
    | "response_type"
    | "code_challenge"
    | "code_challenge_method"
    | "scope"
    | "state"
    | "resource",
    string
  >
>;

/** Failure reasons, as displayed: each has its own sentence on the
 error page (i18n namespace `OAuthConsent`). */
export type AuthorizeFailure =
  | "unknown_client"
  | "invalid_redirect_uri"
  | "unsupported_response_type"
  | "invalid_code_challenge"
  | "invalid_scope"
  | "invalid_resource";

export type AuthorizeValidation =
  | { kind: "invalid"; reason: AuthorizeFailure }
  | {
      kind: "ok";
      client: OAuthClient;
      redirectUri: string;
      codeChallenge: string;
      scope: string;
      resource: string | null;
      state: string | null;
    };

/** Canonical MCP URL expected in `resource` (RFC 8707) — comparison after
 light canonicalization (host case insensitive, final slash tolerated). */
export function isValidResource(resource: string, origin: string): boolean {
  try {
    const parsed = new URL(resource);
    const expected = new URL(`${origin}/api/mcp`);
    return (
      parsed.protocol === expected.protocol &&
      parsed.host.toLowerCase() === expected.host.toLowerCase() &&
      parsed.pathname.replace(/\/$/, "") === expected.pathname &&
      !parsed.search &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

export async function validateAuthorizeRequest(
  params: AuthorizeParams,
  origin: string
): Promise<AuthorizeValidation> {
  const client = await getClient(params.client_id);
  if (!client) return { kind: "invalid", reason: "unknown_client" };

  const redirectUri = params.redirect_uri;
  // STRICT comparison with registered URIs — no normalization.
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return { kind: "invalid", reason: "invalid_redirect_uri" };
  }

  const err = (reason: AuthorizeFailure): AuthorizeValidation => ({
    kind: "invalid",
    reason,
  });

  if (params.response_type !== "code") return err("unsupported_response_type");
  if (params.code_challenge_method && params.code_challenge_method !== "S256") {
    return err("invalid_code_challenge");
  }
  if (!params.code_challenge || !CHALLENGE_RE.test(params.code_challenge)) {
    return err("invalid_code_challenge");
  }
  if (params.scope !== undefined && params.scope !== "" && params.scope !== "minddy") {
    return err("invalid_scope");
  }
  if (params.resource !== undefined && !isValidResource(params.resource, origin)) {
    return err("invalid_resource");
  }

  return {
    kind: "ok",
    client,
    redirectUri,
    codeChallenge: params.code_challenge,
    scope: "minddy",
    resource: params.resource ?? null,
    state: params.state ?? null,
  };
}

/** redirect_uri + parameters added (code/error + verbatim reecho state). */
export function buildCallbackUrl(
  redirectUri: string,
  params: Record<string, string | null>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}
