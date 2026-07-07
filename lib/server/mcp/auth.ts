import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { API_KEY_PREFIX, verifyApiKey } from "@/lib/server/api-keys";

/**
 * Vérification du Bearer mdyk_… pour withMcpAuth. `undefined` → 401 avec
 * l'en-tête WWW-Authenticate (géré par mcp-handler). L'AuthInfo transporte
 * le propriétaire de la clé jusqu'aux tools via extra.authInfo.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken?.startsWith(API_KEY_PREFIX)) return undefined;

  const verified = await verifyApiKey(bearerToken);
  if (!verified) return undefined;

  return {
    token: bearerToken,
    clientId: verified.userId,
    scopes: ["minddy"],
    extra: { userId: verified.userId, keyId: verified.keyId },
  };
}
