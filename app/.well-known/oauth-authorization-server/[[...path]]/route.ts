import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { buildAuthorizationServerMetadata } from "@/lib/server/oauth/metadata";
import { oauthIssuer } from "@/lib/server/oauth/issuer";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";

/** Authorization Server Metadata (RFC 8414). The issuer being without a path, the__KEEP_NL_TOKEN__ flat form is the canonical form; the catch-all absorbs clients which __KEEP_NL_TOKEN__ suffix `/api/mcp` wrongly. __KEEP_NL_TOKEN____KEEP_NL_TOKEN__ The issuer comes from the environment, not from the request: `getPublicOrigin`__KEEP_NL_TOKEN__ read it in `x-forwarded-host`, therefore in a chosen value by__KEEP_NL_TOKEN__ the caller. */
export function GET() {
  return Response.json(buildAuthorizationServerMetadata(oauthIssuer()), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
