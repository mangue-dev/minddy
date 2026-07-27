import { mcpToolCatalog } from "@/lib/server/mcp/catalog";
import { OAUTH_CORS_HEADERS } from "@/lib/server/oauth/cors";
import { MCP_ENDPOINT, SITE_URL } from "@/lib/site";

/**
 * MCP Server Card (SEP-1649) — la fiche d'identité du serveur MCP, à l'endroit
 * où un agent va la chercher tout seul (MIN-88).
 *
 * minddy servait déjà `/.well-known/oauth-authorization-server` et
 * `/.well-known/oauth-protected-resource` : un agent à qui on donne l'URL du
 * endpoint sait donc s'authentifier. Ce qui manquait, c'est le maillon d'AVANT
 * — partir d'un nom de domaine et découvrir qu'il y a un serveur MCP derrière,
 * ce qu'il sait faire, et s'il faut un compte.
 *
 * La liste des outils est dérivée de leur enregistrement réel
 * (`lib/server/mcp/catalog.ts`), comme `/llms.txt`.
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
          // OAuth 2.1 uniquement : il n'existe aucune clé statique. Le 401
          // renvoie le `resource_metadata` qui mène aux deux autres
          // `.well-known`, et l'enregistrement dynamique de client est accepté.
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
