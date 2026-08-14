import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Authorization Server Metadata (RFC 8414). L'issuer étant sans chemin, la
    forme plate est la forme canonique ; le catch-all absorbe les clients qui
    suffixent `/api/mcp` à tort.

    L'issuer vient de l'environnement, pas de la requête : `getPublicOrigin`
    le lisait dans `x-forwarded-host`, donc dans une valeur choisie par
    l'appelant. */
export function GET() {
  return Response.json(buildAuthorizationServerMetadata(oauthIssuer()), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
