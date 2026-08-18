import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { ACCESS_TOKEN_PREFIX } from "@/lib/server/oauth/crypto";
import { verifyOAuthAccessToken } from "@/lib/server/oauth/grants";

/**
 * Bearer verification for withMcpAuth — OAuth 2.1 only (mdyat_…,
 * browser consent; old mdyk_ keys are removed).
 * `undefined` → 401 with WWW-Authenticate + resource_metadata: the client
 * discovers the OAuth flow on its own. keyId = the api_keys “actor” line of
 * grant → rate limit, project access and timeline attribution
 * (“Claude (mcp)” + logo) unchanged.
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
