import "server-only";

/**
 * CORS des endpoints OAuth publics (metadata, register, token). `*` est sûr :
 * aucun cookie n'entre en jeu (Bearer/params uniquement), et les clients MCP
 * navigateur (claude.ai, inspector) en ont besoin.
 */
export const OAUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
} as const;

/** Réponses token/register : jamais mises en cache (RFC 6749 §5.1). */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
} as const;

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
