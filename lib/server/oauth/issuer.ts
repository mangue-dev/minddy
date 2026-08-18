import "server-only";

import { canonicalAppOrigin } from "@/lib/server/app-origin";

/**
 * Coming from the authorization server (RFC 8414) — and by extension the basis of
 * `resource` RFC 8707, published endpoints, and the origin against which
 * we validate the parameters of the authorization request.
 *
 * It is derived from the ENVIRONMENT, never from a request header. An issuer
 * read in `x-forwarded-host` is a value that the caller chooses: simply
 * retrieve the metadata with the desired header to be announced a
 * `authorization_endpoint` and a `token_endpoint` at home, under our name.
 *
 * `OAUTH_ISSUER` first — the explicit escape (dev tunnel, test domain
 *) — then the canonical origin of the app
 * ([app-origin.ts](../app-origin.ts)), which carries the other three cases and serves
 * also for invitation links: it's the same question, "which address is
 * ours", and it deserves only one answer.
 */
export function oauthIssuer(): string {
  const explicit = process.env.OAUTH_ISSUER?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      console.error("[oauth/issuer] OAUTH_ISSUER is not a valid URL — ignored.");
    }
  }

  return canonicalAppOrigin();
}

/** Canonical URL of the protected MCP resource (RFC 8707 / 9728). */
export function mcpResourceUrl(): string {
  return `${oauthIssuer()}/api/mcp`;
}
