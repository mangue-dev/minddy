import type { McpHandlerOptions } from "mcp-handler";
import { MCP_DISCOVERY_INSTRUCTIONS } from "./instructions";

/**
 * Options of the `/api/mcp` handler.
 *
 * `tools.listChanged` is advertised as false because the catalog is fixed for
 * the lifetime of a deployment. `McpServer` turns it on by default as soon as
 * a tool is registered, and 2026-07-28 clients then open a
 * `subscriptions/listen` SSE stream that never receives an event: each one
 * held a function until `maxDuration`, about 40 % of the project's function
 * time (MIN-782). Without the capability the SDK acknowledges the listen and
 * closes the stream immediately.
 */
export const MCP_HANDLER_OPTIONS = {
  serverInfo: { name: "minddy", version: "1.0.0" },
  instructions: MCP_DISCOVERY_INSTRUCTIONS,
  capabilities: { tools: { listChanged: false } },
} satisfies McpHandlerOptions;
