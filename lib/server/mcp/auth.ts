import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { API_KEY_PREFIX, verifyApiKey } from "@/lib/server/api-keys";
import { ACCESS_TOKEN_PREFIX } from "@/lib/server/oauth/crypto";
import { verifyOAuthAccessToken } from "@/lib/server/oauth/grants";

/**
 * Vérification du Bearer pour withMcpAuth — dual auth :
 * - mdyk_…  : clé API personnelle (settings → Clés API) ;
 * - mdyat_… : access token OAuth 2.1 (consentement navigateur).
 * `undefined` → 401 avec WWW-Authenticate + resource_metadata (découverte
 * OAuth gérée par mcp-handler). Les deux chemins produisent le même AuthInfo
 * ({userId, keyId}) : rate limit, accès projets et attribution timeline
 * (api_key_id → « Claude (mcp) » + logo) fonctionnent à l'identique.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const verified = bearerToken.startsWith(API_KEY_PREFIX)
    ? await verifyApiKey(bearerToken)
    : bearerToken.startsWith(ACCESS_TOKEN_PREFIX)
      ? await verifyOAuthAccessToken(bearerToken)
      : null;
  if (!verified) return undefined;

  return {
    token: bearerToken,
    clientId: verified.userId,
    scopes: ["minddy"],
    extra: { userId: verified.userId, keyId: verified.keyId },
  };
}
