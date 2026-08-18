import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/**
 * MCP Server Card (SEP-1649) — the identity card of the MCP server, right side up
 * where an agent goes to look for her alone (MIN-88).
 *
 * minddy was already serving `/.well-known/oauth-authorization-server` and
 * `/.well-known/oauth-protected-resource`: an agent who is given the URL of the
 * endpoint therefore knows how to authenticate itself. What was missing was the BEFORE link
 * — start from a domain name and discover that there is an MCP server behind it,
 * what he can do, and whether he needs an account.
 *
 * The list of tools is derived from their actual registration
 * (`lib/server/mcp/catalog.ts`), like `/llms.txt`.
 */
export function GET(): Response {
  const tools = mcpToolCatalog();

  return Response.json(
    {
      name: "minddy",
      title: "minddy",
      description:
        "A minimal issue tracker. Projects hold issues, objectives group them around " +
        "a goal, and an issue can carry an implementation plan whose markdown " +
        "checkboxes are trackable tasks. Agents read and write minddy over MCP, " +
        "acting as the user who authorised them.",
      websiteUrl: SITE_URL,
      version: "1.0.0",
      remotes: [
        {
          type: "streamable-http",
          url: MCP_ENDPOINT,
          // OAuth 2.1 only: there are no static keys. The 401
          // returns the `resource_metadata` which leads to the other two
          // `.well-known`, and dynamic client registration is accepted.
          authentication: {
            required: true,
            type: "oauth2",
            protectedResourceMetadata: `${SITE_URL}/.well-known/oauth-protected-resource`,
            authorizationServerMetadata: `${SITE_URL}/.well-known/oauth-authorization-server`,
            scopes: ["minddy"],
          },
        },
      ],
      capabilities: { tools: { listChanged: false } },
      tools: tools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        readOnly: tool.readOnly,
      })),
      documentation: `${SITE_URL}/llms.txt`,
    },
    {
      headers: {
        ...OAUTH_CORS_HEADERS,
        "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
