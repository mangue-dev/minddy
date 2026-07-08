import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Alias OIDC discovery : certains clients MCP sondent openid-configuration
    avant oauth-authorization-server — même document RFC 8414. */
export function GET(request: Request) {
  return Response.json(buildAuthorizationServerMetadata(getPublicOrigin(request)), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
