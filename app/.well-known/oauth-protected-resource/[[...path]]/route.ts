import {
  generateProtectedResourceMetadata,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { mcpResourceUrl, oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/**
 * Protected Resource Metadata (RFC 9728) of the MCP endpoint. The catch-all serves
 * the root form (the one that WWW-Authenticate of withMcpAuth announces) AND
 * the form with inserted path `…/oauth-protected-resource/api/mcp` that the
 * clients spec-2025-06-18 construisent. On n'utilise PAS protectedResourceHandler
 * bare: at the root it would derive a `resource` without /api/mcp.
 *
 * The origin comes from the environment, never from `x-forwarded-host`: the
 * `resource` announced here is the one that clients will return to `/authorize`.
 */
export function GET() {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [oauthIssuer()],
    resourceUrl: mcpResourceUrl(),
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
