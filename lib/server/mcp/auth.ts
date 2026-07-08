import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { ACCESS_TOKEN_PREFIX } from "@/lib/server/oauth/crypto";
import { verifyOAuthAccessToken } from "@/lib/server/oauth/grants";

/**
 * Vérification du Bearer pour withMcpAuth — OAuth 2.1 uniquement (mdyat_…,
 * consentement navigateur ; les anciennes clés mdyk_ sont retirées).
 * `undefined` → 401 avec WWW-Authenticate + resource_metadata : le client
 * découvre le flux OAuth tout seul. keyId = la ligne api_keys « acteur » du
 * grant → rate limit, accès projets et attribution timeline
 * (« Claude (mcp) » + logo) inchangés.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken?.startsWith(ACCESS_TOKEN_PREFIX)) return undefined;

  const verified = await verifyOAuthAccessToken(bearerToken);
  if (!verified) return undefined;

  return {
    token: bearerToken,
    clientId: verified.userId,
    scopes: ["minddy"],
    extra: { userId: verified.userId, keyId: verified.keyId },
  };
}
