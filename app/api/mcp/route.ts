import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerMinddyTools } from "@/lib/server/mcp/tools";
import { verifyMcpToken } from "@/lib/server/mcp/auth";
import { MCP_DISCOVERY_INSTRUCTIONS } from "@/lib/server/mcp/instructions";

/**
 * minddy MCP server — stateless Streamable HTTP (a new McpServer per
 * POST, with no sessions or server notifications: a “tools-only” profile,
 * suitable for serverless). Auth OAuth 2.1 only: 401 returns
 * resource_metadata, the client discovers the AS (well-known) and opens the
 * browser for consent — the agent acts as the user who has
 * allowed.
 *
 *   claude mcp add --scope user --transport http minddy <url>/api/mcp
 * (then /mcp in Claude Code to authenticate)
 */

const handler = createMcpHandler(
  (server) => registerMinddyTools(server),
  {
    serverInfo: { name: "minddy", version: "1.0.0" },
    instructions: MCP_DISCOVERY_INSTRUCTIONS,
  }
);

const authedHandler = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
export const maxDuration = 60;
