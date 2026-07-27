import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMinddyTools } from "@/lib/server/mcp/tools";
import { verifyMcpToken } from "@/lib/server/mcp/auth";
import { MCP_SERVER_INSTRUCTIONS } from "@/lib/server/mcp/instructions";

/**
 * Serveur MCP de minddy — Streamable HTTP stateless (un McpServer neuf par
 * POST, pas de sessions ni de notifications serveur : profil « tools-only »,
 * adapté au serverless). Auth OAuth 2.1 uniquement : le 401 renvoie le
 * resource_metadata, le client découvre l'AS (well-known) et ouvre le
 * navigateur pour le consentement — l'agent agit comme l'utilisateur qui a
 * autorisé.
 *
 *   claude mcp add --scope user --transport http minddy <url>/api/mcp
 *   (puis /mcp dans Claude Code pour s'authentifier)
 */

const handler = createMcpHandler(
  (server) => registerMinddyTools(server),
  {
    serverInfo: { name: "minddy", version: "1.0.0" },
    instructions: MCP_SERVER_INSTRUCTIONS,
  },
  { basePath: "/api", disableSse: true, maxDuration: 60 }
);

const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
export const maxDuration = 60;
