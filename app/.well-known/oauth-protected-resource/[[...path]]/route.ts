import {
  generateProtectedResourceMetadata,
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/**
 * Protected Resource Metadata (RFC 9728) du endpoint MCP. Le catch-all sert
 * la forme racine (celle que le WWW-Authenticate de withMcpAuth annonce) ET
 * la forme avec chemin inséré `…/oauth-protected-resource/api/mcp` que les
 * clients spec-2025-06-18 construisent. On n'utilise PAS protectedResourceHandler
 * nu : à la racine il dériverait un `resource` sans /api/mcp.
 */
export function GET(request: Request) {
  const origin = getPublicOrigin(request);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
    additionalMetadata: {
      scopes_supported: ["minddy"],
      bearer_methods_supported: ["header"],
      resource_name: "minddy",
    },
  });
  return Response.json(metadata, {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
