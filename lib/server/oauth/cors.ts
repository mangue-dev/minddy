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

/**
 * Other methods on the POST-only endpoints (register, token). Next.js's
 * automatic 405 carries no `Allow` header, which RFC 9110 §15.5.6 requires;
 * MCP health probes hit `GET /api/oauth/register` routinely (MIN-772).
 */
export function methodNotAllowed(): Response {
  return Response.json(
    { error: "invalid_request", error_description: "This endpoint only accepts POST." },
    {
      status: 405,
      headers: { ...OAUTH_CORS_HEADERS, ...NO_STORE_HEADERS, Allow: "POST, OPTIONS" },
    }
  );
}
