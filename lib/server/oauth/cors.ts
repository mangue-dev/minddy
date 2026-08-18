import "server-only";

/**
 * CORS of public OAuth endpoints (metadata, register, token). `*` is safe:
 * no cookies come into play (Bearer/params only), and MCP
 * browser clients (claude.ai, inspector) need them.
 */
export const OAUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
} as const;

/** Token/register responses: never cached (RFC 6749 §5.1). */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
