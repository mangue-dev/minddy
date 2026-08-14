import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Alias OIDC discovery : certains clients MCP sondent openid-configuration
    avant oauth-authorization-server — même document RFC 8414. */
export function GET() {
  return Response.json(buildAuthorizationServerMetadata(oauthIssuer()), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
