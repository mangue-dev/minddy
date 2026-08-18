import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Alias ​​OIDC discovery: some MCP clients probe openid-configuration__KEEP_NL_TOKEN__ before oauth-authorization-server — same RFC 8414 document. */
export function GET() {
  return Response.json(buildAuthorizationServerMetadata(oauthIssuer()), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
