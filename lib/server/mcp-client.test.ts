import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mcpConnectionInput } from "@/lib/mcp-client";
import {
  encryptMcpToken,
  executeMcpTool,
  listMcpConnections,
  mcpFetch,
  MCP_MAX_BYTES,
  withMcpClient,
  type McpConnectionRow,
} from "./mcp-client";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  rows: [] as Array<McpConnectionRow & { user_id: string }>,
}));
vi.mock("./safe-fetch", () => ({ safeFetchResponse: mocks.fetch }));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: () => {
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        order: async () => ({
          data: matches().map(({ user_id: _userId, ...row }) => row),
          error: null,
        }),
        maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
      };
      function matches() {
        return mocks.rows.filter((row) =>
          filters.every(
            ([key, value]) => row[key as keyof typeof row] === value,
          ),
        );
      }
      return query;
    },
  }),
}));
const ID = "33b8b032-d967-4f06-aabd-dc165e988335";
const connection: McpConnectionRow = {
  id: ID,
  name: "Tools",
  url: "https://mcp.example.com/mcp",
  enabled: true,
  created_at: "2026-09-04",
  token_encrypted: null,
  user_id: "alice",
  headers_encrypted: null,
  oauth_encrypted: null,
  transport: "http",
  auth_mode: "none",
  oauth_connected: false,
};
let listedTools:
  | Array<{
      name: string;
      description?: string;
      inputSchema: { type: string; properties?: Record<string, unknown> };
    }>
  | undefined;
const rpcCalls: Array<{ method: string; params?: Record<string, unknown> }> =
  [];
function server(
  result: Record<string, unknown> = {
    content: [{ type: "text", text: "Done" }],
  },
) {
  mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
    expect(init).toMatchObject({ maxRedirects: 0 });
    if (init.method === "GET") return new Response(null, { status: 405 });
    if (init.method === "DELETE") return new Response(null, { status: 204 });
    const rpc = JSON.parse(String(init.body));
    rpcCalls.push(rpc);
    if (rpc.id === undefined) return new Response(null, { status: 202 });
    const response =
      rpc.method === "initialize"
        ? {
            protocolVersion: "2025-11-25",
            capabilities: { tools: {} },
            serverInfo: { name: "test", version: "1" },
          }
        : rpc.method === "tools/list"
          ? {
              tools: listedTools ?? [
                {
                  name: "echo",
                  inputSchema: {
                    type: "object",
                    properties: { value: { type: "string" } },
                  },
                },
              ],
              nextCursor: "page-2",
            }
          : result;
    return Response.json(
      { jsonrpc: "2.0", id: rpc.id, result: response },
      { headers: { "mcp-session-id": "test-session" } },
    );
  });
}
beforeEach(() => {
  vi.stubEnv(
    "AI_KEY_ENCRYPTION_SECRET",
    "test-secret-with-at-least-thirty-two-characters",
  );
  mocks.rows = [{ ...connection, user_id: "alice" }];
  rpcCalls.length = 0;
  listedTools = undefined;
  mocks.fetch.mockReset();
  server();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("personal MCP client", () => {
  it("validates public HTTPS endpoint syntax and bearer credentials", () => {
    for (const url of [
      "http://example.com",
      "https://user:secret@example.com/mcp",
      "https://example.com/?token=secret",
      "https://example.com/#fragment",
      "file:///etc/passwd",
    ]) {
      expect(mcpConnectionInput.safeParse({ name: "Test", url }).success).toBe(
        false,
      );
    }
    expect(
      mcpConnectionInput.safeParse({
        name: "Test",
        url: connection.url,
        token: "secret\nheader",
      }).success,
    ).toBe(false);
    expect(
      mcpConnectionInput.safeParse({
        name: "Test",
        url: connection.url,
        user_id: "victim",
      }).success,
    ).toBe(false);
  });
  it("lists only the caller's metadata and never encrypted tokens", async () => {
    mocks.rows.push({ ...connection, user_id: "bob", name: "Private" });
    mocks.rows[0].token_encrypted = encryptMcpToken("secret-token");
    const list = await listMcpConnections("alice");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Tools", has_token: true });
    expect(list[0]).not.toHaveProperty("token_encrypted");
  });
  it("refuses foreign, disabled, and deleted connections before any network request", async () => {
    expect(
      (
        await executeMcpTool("bob", "call_mcp_tool", {
          connection_id: ID,
          tool: "echo",
          arguments: {},
        })
      ).success,
    ).toBe(false);
    mocks.rows[0].enabled = false;
    expect(
      (await executeMcpTool("alice", "list_mcp_tools", { connection_id: ID }))
        .success,
    ).toBe(false);
    mocks.rows = [];
    expect(
      (await executeMcpTool("alice", "list_mcp_tools", { connection_id: ID }))
        .success,
    ).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("discovers one page using the actual SDK and closes its remote session", async () => {
    const outcome = await executeMcpTool("alice", "list_mcp_tools", {
      connection_id: ID,
      cursor: "page-1",
    });
    expect(outcome).toMatchObject({
      success: true,
      result: { nextCursor: "page-2", tools: [{ name: "echo" }] },
    });
    expect(rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "tools/list",
        params: { cursor: "page-1" },
      }),
    );
    expect(
      mocks.fetch.mock.calls.some(([, init]) => init.method === "DELETE"),
    ).toBe(true);
  });
  it("returns the first page without automatic aggregation", async () => {
    expect(
      await executeMcpTool("alice", "list_mcp_tools", { connection_id: ID }),
    ).toMatchObject({ success: true, result: { nextCursor: "page-2" } });
    expect(
      rpcCalls.filter((call) => call.method === "tools/list"),
    ).toHaveLength(1);
  });
  it("summarizes large catalogs and retrieves the selected full schema", async () => {
    listedTools = Array.from({ length: 70 }, (_, index) => ({
      name: `tool_${index}`,
      description: "d".repeat(2000),
      inputSchema: { type: "object" },
    }));
    const first = await executeMcpTool("alice", "list_mcp_tools", {
      connection_id: ID,
    });
    expect(first).toMatchObject({ success: true, result: { nextOffset: 50 } });
    const last = await executeMcpTool("alice", "list_mcp_tools", {
      connection_id: ID,
      offset: 50,
    });
    expect(last).toMatchObject({
      success: true,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "tool_69" }),
        ]),
      },
    });
    const selected = await executeMcpTool("alice", "list_mcp_tools", {
      connection_id: ID,
      tool: "tool_69",
    });
    expect(selected).toMatchObject({
      success: true,
      result: { tool: { name: "tool_69", inputSchema: { type: "object" } } },
    });
  });
  it("executes exact discovered tool names, preserves nested arguments and redacts reflected credentials", async () => {
    const secret = "mcp-private-bearer-token";
    mocks.rows[0].token_encrypted = encryptMcpToken(secret);
    server({ content: [{ type: "text", text: `Bearer ${secret}` }] });
    const outcome = await executeMcpTool("alice", "call_mcp_tool", {
      connection_id: ID,
      tool: "echo",
      arguments: { nested: { values: [1, true] } },
    });
    expect(outcome).toMatchObject({
      success: true,
      result: { content: [{ text: "Bearer [REDACTED]" }] },
    });
    expect(rpcCalls).toContainEqual(
      expect.objectContaining({
        method: "tools/call",
        params: expect.objectContaining({
          name: "echo",
          arguments: { nested: { values: [1, true] } },
        }),
      }),
    );
    expect(
      new Headers(mocks.fetch.mock.calls[0][1].headers).get("authorization"),
    ).toBe(`Bearer ${secret}`);
    expect(JSON.stringify(outcome)).not.toContain(secret);
  });
  it.each([
    { auth: "bearer", secret: "abc123" },
    { auth: "bearer", secret: "7" },
    { auth: "header", secret: "abc123" },
    { auth: "header", secret: "7" },
  ])("redacts embedded short $auth credentials ($secret) in text and structured results", async ({ auth, secret }) => {
    if (auth === "bearer") {
      mocks.rows[0].auth_mode = "bearer";
      mocks.rows[0].token_encrypted = encryptMcpToken(secret);
    } else {
      mocks.rows[0].headers_encrypted = encryptMcpToken(
        JSON.stringify({ "X-API-Key": secret }),
      );
    }
    server({
      content: [{ type: "text", text: `Bearer ${secret}; repeated ${secret}.` }],
      structuredContent: {
        nested: { credential: secret, reflected: `value=${secret}` },
        entries: [secret, `prefix${secret}suffix`],
      },
    });
    const outcome = await executeMcpTool("alice", "call_mcp_tool", {
      connection_id: ID,
      tool: "echo",
      arguments: {},
    });
    expect(outcome).toMatchObject({
      success: true,
      result: {
        content: [{ text: "Bearer [REDACTED]; repeated [REDACTED]." }],
        structuredContent: {
          nested: { credential: "[REDACTED]", reflected: "value=[REDACTED]" },
          entries: ["[REDACTED]", "prefix[REDACTED]suffix"],
        },
      },
    });
    expect(JSON.stringify(outcome)).not.toContain(secret);
    const sentHeaders = new Headers(mocks.fetch.mock.calls[0][1].headers);
    expect(sentHeaders.get(auth === "bearer" ? "authorization" : "x-api-key"))
      .toBe(auth === "bearer" ? `Bearer ${secret}` : secret);
  });
  it("redacts embedded short credentials from discovered tool descriptions", async () => {
    mocks.rows[0].auth_mode = "bearer";
    mocks.rows[0].token_encrypted = encryptMcpToken("abc123");
    listedTools = [{
      name: "echo",
      description: "Authenticated with Bearer abc123",
      inputSchema: { type: "object" },
    }];
    const outcome = await executeMcpTool("alice", "list_mcp_tools", {
      connection_id: ID,
    });
    expect(outcome).toMatchObject({
      success: true,
      result: { tools: [{ description: "Authenticated with Bearer [REDACTED]" }] },
    });
    expect(JSON.stringify(outcome)).not.toContain("abc123");
  });
  it("preserves remote tool errors without retrying an action", async () => {
    server({
      isError: true,
      content: [{ type: "text", text: "Action rejected" }],
    });
    const outcome = await executeMcpTool("alice", "call_mcp_tool", {
      connection_id: ID,
      tool: "echo",
      arguments: {},
    });
    expect(outcome).toMatchObject({
      success: false,
      result: { isError: true },
    });
    expect(
      rpcCalls.filter((call) => call.method === "tools/call"),
    ).toHaveLength(1);
  });
  it("fails closed when an encrypted token cannot be decrypted", async () => {
    mocks.rows[0].token_encrypted = "broken";
    expect(
      (await executeMcpTool("alice", "list_mcp_tools", { connection_id: ID }))
        .success,
    ).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("AI_KEY_ENCRYPTION_SECRET", "");
    expect(() => encryptMcpToken("secret")).toThrow();
  });
  it("bounds streamed bytes and uses a caller cancellation signal", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array(MCP_MAX_BYTES + 1)),
    );
    const controller = new AbortController();
    const response = await mcpFetch(controller.signal)(connection.url);
    await expect(response.text()).rejects.toThrow("MCP response too large");
    controller.abort();
    expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("supports legacy SSE endpoints and closes their stream", async () => {
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    let canceled = false;
    mocks.rows[0].transport = "sse";
    mocks.fetch.mockImplementation(async (_url: string, init: RequestInit) => {
      if (init.method === "GET")
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              controller = stream;
              stream.enqueue(
                encoder.encode(
                  "event: endpoint\ndata: /messages?session=123\n\n",
                ),
              );
            },
            cancel() {
              canceled = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      const rpc = JSON.parse(String(init.body));
      if (rpc.id !== undefined) {
        const result =
          rpc.method === "initialize"
            ? {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "legacy", version: "1" },
              }
            : {
                tools: [
                  { name: "legacy_tool", inputSchema: { type: "object" } },
                ],
              };
        controller.enqueue(
          encoder.encode(
            `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result })}\n\n`,
          ),
        );
      }
      return new Response(null, { status: 202 });
    });
    expect(
      await executeMcpTool("alice", "list_mcp_tools", { connection_id: ID }),
    ).toMatchObject({
      success: true,
      result: { tools: [{ name: "legacy_tool" }] },
    });
    await vi.waitFor(() => expect(canceled).toBe(true));
  });
  it("bounds tool results and closes sessions after failed actions", async () => {
    server({ content: [{ type: "text", text: "a".repeat(65_000) }] });
    expect(
      (
        await executeMcpTool("alice", "call_mcp_tool", {
          connection_id: ID,
          tool: "echo",
          arguments: {},
        })
      ).success,
    ).toBe(false);
    expect(
      mocks.fetch.mock.calls.some(([, init]) => init.method === "DELETE"),
    ).toBe(true);
    await expect(
      withMcpClient(connection, async () => {
        throw new Error("test");
      }),
    ).rejects.toThrow("test");
  });
});
