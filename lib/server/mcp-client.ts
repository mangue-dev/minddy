import "server-only";

import {
  Client,
  StreamableHTTPClientTransport,
  SSEClientTransport,
} from "@modelcontextprotocol/client";
import { getServiceClient } from "@/lib/supabase-service";
import {
  mcpConnectionId,
  mcpEndpoint,
  type McpConnection,
} from "@/lib/mcp-client";
import { mcpFetch, MCP_TIMEOUT_MS } from "./mcp-http";
export { mcpFetch, MCP_TIMEOUT_MS, MCP_MAX_BYTES } from "./mcp-http";
import { decryptMcpToken } from "./mcp-credentials";
export { encryptMcpToken, decryptMcpToken } from "./mcp-credentials";
import { openMcpOAuth } from "./mcp-oauth";
import { checkSessionRateLimit } from "./session-rate-limit";

const MAX_RESULT_BYTES = 64_000;
const COLUMNS =
  "id,name,url,enabled,created_at,transport,auth_mode,oauth_connected";
export type McpConnectionRow = Omit<
  McpConnection,
  "has_token" | "has_headers"
> & {
  user_id: string;
  token_encrypted: string | null;
  headers_encrypted: string | null;
  oauth_encrypted: string | null;
};

export async function listMcpConnections(
  userId: string,
): Promise<McpConnection[]> {
  const { data, error } = await getServiceClient()
    .from("user_mcp_connections")
    .select(`${COLUMNS},token_encrypted,headers_encrypted`)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error("Could not load MCP connections");
  return (data ?? []).map(({ token_encrypted, headers_encrypted, ...row }) => ({
    ...row,
    has_token: !!token_encrypted,
    has_headers: !!headers_encrypted,
  }));
}

export async function getMcpConnection(
  userId: string,
  id: string,
): Promise<McpConnectionRow | null> {
  if (!mcpConnectionId.safeParse(id).success) return null;
  const { data, error } = await getServiceClient()
    .from("user_mcp_connections")
    .select(
      `${COLUMNS},user_id,token_encrypted,headers_encrypted,oauth_encrypted`,
    )
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Could not load MCP connection");
  return data;
}

/** A fresh session per operation avoids sharing authentication between accounts. */
export async function withMcpClient<T>(
  connection: McpConnectionRow,
  action: (client: Client) => Promise<T>,
): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), MCP_TIMEOUT_MS);
  const client = new Client(
    { name: "minddy-numo", version: "1.0.0" },
    { listMaxPages: 10 },
  );
  let transport: StreamableHTTPClientTransport | SSEClientTransport | undefined;
  let oauth: Awaited<ReturnType<typeof openMcpOAuth>> | undefined;
  try {
    const token = decryptMcpToken(connection.token_encrypted);
    if (connection.auth_mode === "oauth")
      oauth = await openMcpOAuth(connection);
    const headers = connection.headers_encrypted
      ? (JSON.parse(decryptMcpToken(connection.headers_encrypted)!) as Record<
          string,
          string
        >)
      : {};
    const Transport =
      connection.transport === "sse"
        ? SSEClientTransport
        : StreamableHTTPClientTransport;
    transport = new Transport(new URL(mcpEndpoint.parse(connection.url)), {
      fetch: mcpFetch(abort.signal),
      requestInit: { headers },
      ...(oauth
        ? { authProvider: oauth.provider }
        : token
          ? { authProvider: { token: async () => token } }
          : {}),
    });
    await client.connect(transport, {
      timeout: MCP_TIMEOUT_MS,
      signal: abort.signal,
    });
    const result = await action(client);
    // A remote server can reflect its Authorization header. Never persist it in a conversation.
    const secrets = [
      token,
      ...Object.values(headers),
      ...(oauth?.secrets() ?? []),
    ].filter((value): value is string => !!value);
    const redact = (value: string) =>
      secrets.reduce(
        (text, secret) =>
          secret.length < 8
            ? text === secret
              ? "[REDACTED]"
              : text
            : text.split(secret).join("[REDACTED]"),
        value,
      );
    const serialized = JSON.stringify(result, (_key, value) =>
      typeof value === "string" ? redact(value) : value,
    );
    if (Buffer.byteLength(serialized) > MAX_RESULT_BYTES)
      throw new Error("MCP result too large");
    return JSON.parse(serialized) as T;
  } finally {
    // Cleanup gets its own short deadline and always closes local streams.
    const cleanupTimer = setTimeout(() => abort.abort(), 1000);
    try {
      if (transport instanceof StreamableHTTPClientTransport)
        await transport.terminateSession().catch(() => {});
    } finally {
      abort.abort();
      clearTimeout(cleanupTimer);
      clearTimeout(timer);
      await client.close().catch(() => {});
      await oauth?.release();
    }
  }
}

/** Request exactly one page; the SDK's listTools(undefined) aggregates all pages. */
export function listMcpToolPage(client: Client, cursor?: string) {
  return client.request(
    { method: "tools/list", params: cursor ? { cursor } : {} },
    { timeout: MCP_TIMEOUT_MS },
  );
}

export async function executeMcpTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
) {
  try {
    if (!checkSessionRateLimit(userId, "mcp-tools", { limit: 60 }).allowed) {
      return {
        success: false,
        result: { error: "Too many MCP requests. Try again in a minute." },
      };
    }
    if (name === "list_mcp_tools" && !args.connection_id) {
      const connections = await listMcpConnections(userId);
      return {
        success: true,
        result: {
          connections: connections
            .filter((c) => c.enabled)
            .map(({ id, name }) => ({ id, name })),
        },
      };
    }
    const connection = await getMcpConnection(
      userId,
      String(args.connection_id ?? ""),
    );
    if (!connection?.enabled)
      return {
        success: false,
        result: {
          error: "MCP connection unavailable. Check your account settings.",
        },
      };
    if (name === "list_mcp_tools") {
      const result = await withMcpClient(connection, async (client) => {
        const page = await listMcpToolPage(
          client,
          typeof args.cursor === "string" ? args.cursor : undefined,
        );
        if (typeof args.tool === "string") {
          const tool = page.tools.find(
            (candidate) => candidate.name === args.tool,
          );
          return tool
            ? { tool }
            : {
                error: "Tool not found on this page.",
                nextCursor: page.nextCursor,
              };
        }
        if (Buffer.byteLength(JSON.stringify(page)) <= MAX_RESULT_BYTES)
          return page;
        const offset =
          typeof args.offset === "number" &&
          Number.isInteger(args.offset) &&
          args.offset >= 0
            ? args.offset
            : 0;
        return {
          tools: page.tools
            .slice(offset, offset + 50)
            .map(({ name, description }) => ({
              name,
              description: description?.slice(0, 200),
            })),
          nextCursor: page.nextCursor,
          nextOffset: offset + 50 < page.tools.length ? offset + 50 : undefined,
          instruction:
            "Follow nextOffset with offset and the same cursor before moving to nextCursor. Pass tool with an exact name and this page's cursor to retrieve its full input schema.",
        };
      });
      return { success: !("error" in result), result };
    }
    if (
      name !== "call_mcp_tool" ||
      typeof args.tool !== "string" ||
      !args.tool ||
      args.tool.length > 256
    ) {
      return {
        success: false,
        result: { error: "Specify a discovered MCP tool name." },
      };
    }
    if (
      !args.arguments ||
      typeof args.arguments !== "object" ||
      Array.isArray(args.arguments) ||
      Buffer.byteLength(JSON.stringify(args.arguments)) > MAX_RESULT_BYTES
    ) {
      return {
        success: false,
        result: {
          error: "MCP arguments must be an object smaller than 64 KB.",
        },
      };
    }
    const result = await withMcpClient(connection, (client) =>
      client.callTool(
        {
          name: args.tool as string,
          arguments: args.arguments as Record<string, unknown>,
        },
        { timeout: MCP_TIMEOUT_MS },
      ),
    );
    return { success: !result.isError, result };
  } catch {
    // SDK errors can contain remote bodies, URLs, and authentication material.
    return {
      success: false,
      result: {
        error:
          "MCP request failed. Check the server, credentials, or response size in account settings. The action may have run; do not retry a write without checking.",
      },
    };
  }
}
