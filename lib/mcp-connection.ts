/* Client-safe MCP connection shape and helpers. Keep this module free of
   validation schemas: lib/mcp-client.ts builds zod schemas at import, and a
   value import from it would ship the whole zod runtime with the composer. */

export interface McpConnection {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  has_token: boolean;
  has_headers: boolean;
  transport: "http" | "sse";
  auth_mode: "none" | "bearer" | "oauth";
  oauth_connected: boolean;
  created_at: string;
}

export function mcpConnectionNeedsAuth(connection: {
  auth_mode: McpConnection["auth_mode"];
  oauth_connected: boolean;
  has_token?: boolean;
}): boolean {
  return connection.auth_mode === "oauth"
    ? !connection.oauth_connected
    : connection.auth_mode === "bearer" && !connection.has_token;
}

export function mcpSettingsHref(connectionId?: string): string {
  const params = new URLSearchParams({ tab: "agent" });
  if (connectionId) params.set("mcp_connection", connectionId);
  return `/settings?${params}`;
}
