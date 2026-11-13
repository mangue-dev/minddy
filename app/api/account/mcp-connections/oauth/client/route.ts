import { mcpClientMetadataDocument } from "@/lib/server/mcp-oauth";

/**
 * minddy's Client ID Metadata Document. Its URL is minddy's OAuth `client_id`
 * with MCP providers that identify clients this way (Vercel, MIN-835): the
 * provider fetches it during authorization, without a session, so the route
 * is public and exposes only what minddy declares about itself.
 */
export function GET() {
  return Response.json(mcpClientMetadataDocument(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
