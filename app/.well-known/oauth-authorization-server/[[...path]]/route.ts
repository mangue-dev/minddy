import { getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Authorization Server Metadata (RFC 8414). L'issuer étant sans chemin, la
    forme plate est la forme canonique ; le catch-all absorbe les clients qui
    suffixent `/api/mcp` à tort. */
export function GET(request: Request) {
  return Response.json(buildAuthorizationServerMetadata(getPublicOrigin(request)), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
