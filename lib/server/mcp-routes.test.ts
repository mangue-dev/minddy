import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/account/mcp-connections/route";
import { PATCH, DELETE } from "@/app/api/account/mcp-connections/[id]/route";
import { POST as probe } from "@/app/api/account/mcp-connections/[id]/test/route";
import { POST as authorize } from "@/app/api/account/mcp-connections/[id]/authorize/route";
import { POST as complete } from "@/app/api/account/mcp-connections/oauth/complete/route";
import { executeTool, type ToolContext } from "./assistant/execute-tool";

const mocks = vi.hoisted(() => ({
  authenticated: true,
  owner: "alice",
  current: null as Record<string, unknown> | null,
  calls: [] as Array<{
    operation: string;
    filters: Record<string, unknown>;
    values?: Record<string, unknown>;
  }>,
  execute: vi.fn(),
  probe: vi.fn(),
  authorize: vi.fn(),
  complete: vi.fn(),
  ClientNotApproved: class extends Error {},
  AppRequired: class extends Error {},
}));
const ID = "33b8b032-d967-4f06-aabd-dc165e988335";
vi.mock("./api-auth", () => ({
  getAuthedUser: async () =>
    mocks.authenticated
      ? { ok: true, user: { id: mocks.owner } }
      : {
          ok: false,
          response: NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 },
          ),
        },
}));
vi.mock("./mcp-client", () => ({
  listMcpConnections: async () => [],
  getMcpConnection: async (userId: string) =>
    userId === "alice" ? mocks.current : null,
  withMcpClient: mocks.probe,
  executeMcpTool: mocks.execute,
  MCP_TIMEOUT_MS: 30000,
}));
vi.mock("./mcp-oauth", () => ({
  mcpOAuthCallback: () => "https://minddy.test/callback",
  initialMcpOAuth: () => "encrypted-oauth",
  startMcpOAuth: mocks.authorize,
  completeMcpOAuth: mocks.complete,
  McpClientNotApprovedError: mocks.ClientNotApproved,
  McpOAuthAppRequiredError: mocks.AppRequired,
}));
vi.mock("./safe-fetch", () => ({
  assertPublicHttpUrl: async (url: string) => {
    if (url.includes("localhost")) throw new Error("private");
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      if (table === "mcp_content_scope") return {
        select: () => ({ eq: () => ({ maybeSingle: async () =>
          ({ data: null, error: { code: "42P01" } }) }) }),
      };
      let operation = "read";
      let values: Record<string, unknown> | undefined;
      const filters: Record<string, unknown> = {};
      const finish = () => {
        mocks.calls.push({ operation, filters, values });
        return { data: { id: ID }, error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        update: (input: Record<string, unknown>) => {
          operation = "update";
          values = input;
          return query;
        },
        insert: (input: Record<string, unknown>) => {
          operation = "insert";
          values = input;
          return query;
        },
        delete: () => {
          operation = "delete";
          return query;
        },
        single: async () => finish(),
        maybeSingle: async () => finish(),
        then: (resolve: (result: ReturnType<typeof finish>) => void) =>
          resolve(finish()),
      };
      return query;
    },
  }),
}));
beforeEach(() => {
  mocks.authenticated = true;
  mocks.owner = "alice";
  mocks.calls = [];
  mocks.current = {
    id: ID,
    user_id: "alice",
    url: "https://mcp.example.com/mcp",
    auth_mode: "none",
  };
  mocks.execute
    .mockReset()
    .mockResolvedValue({ success: true, result: { connections: [] } });
  mocks.probe.mockReset().mockResolvedValue({ tools: [] });
  mocks.authorize
    .mockReset()
    .mockResolvedValue("https://auth.example.com/authorize");
  mocks.complete.mockReset().mockResolvedValue(undefined);
});
const context = { params: Promise.resolve({ id: ID }) };
const request = (method: string, body?: unknown) =>
  new NextRequest("https://minddy.test/api/account/mcp-connections", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
describe("MCP account routes and assistant dispatch", () => {
  it("requires an authenticated account for every operation", async () => {
    mocks.authenticated = false;
    for (const response of await Promise.all([
      GET(request("GET")),
      POST(request("POST", {})),
      PATCH(request("PATCH", {}), context),
      DELETE(request("DELETE"), context),
      probe(request("POST"), context),
      authorize(request("POST"), context),
    ]))
      expect(response.status).toBe(401);
    expect(mocks.calls).toHaveLength(0);
  });
  it("rejects model-style ownership overrides and private endpoints", async () => {
    expect(
      (
        await POST(
          request("POST", {
            name: "MCP",
            url: "https://mcp.example.com",
            user_id: "bob",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request("POST", { name: "MCP", url: "https://localhost/mcp" }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.calls).toHaveLength(0);
  });
  it("creates under the authenticated identity and returns only the connection id", async () => {
    const response = await POST(
      request("POST", { name: "MCP", url: "https://mcp.example.com" }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: ID });
    expect(mocks.calls[0].values).toMatchObject({
      user_id: "alice",
      name: "MCP",
    });
  });
  it("scopes updates, deletes, probes, and OAuth to the requesting account", async () => {
    mocks.owner = "bob";
    expect(
      (await PATCH(request("PATCH", { name: "Stolen" }), context)).status,
    ).toBe(404);
    expect((await probe(request("POST"), context)).status).toBe(404);
    expect((await authorize(request("POST"), context)).status).toBe(404);
    await DELETE(request("DELETE"), context);
    expect(mocks.calls).toEqual([
      {
        operation: "delete",
        filters: { id: ID, user_id: "bob" },
        values: undefined,
      },
    ]);
    expect(mocks.probe).not.toHaveBeenCalled();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("starts a desktop-marked flow only when the app asks for one", async () => {
    await authorize(request("POST", { desktop: true }), context);
    await authorize(request("POST"), context);
    expect(mocks.authorize.mock.calls.map((call) => call[1])).toEqual([
      { desktop: true },
      { desktop: false },
    ]);
  });
  it("redeems a desktop sign-in answer for the calling account only", async () => {
    const answer = { state: "d".padEnd(65, "a"), code: "code", iss: "https://issuer.example" };
    const response = await complete(request("POST", answer));
    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith(
      "alice",
      answer.state,
      "code",
      "https://issuer.example",
    );
    mocks.complete.mockRejectedValueOnce(new Error("foreign attempt"));
    expect((await complete(request("POST", answer))).status).toBe(400);
    expect((await complete(request("POST", { state: 1 }))).status).toBe(400);
    mocks.authenticated = false;
    expect((await complete(request("POST", answer))).status).toBe(401);
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });
  it("names the reason an OAuth flow cannot start", async () => {
    const codeFor = async (error: Error) => {
      mocks.authorize.mockRejectedValueOnce(error);
      const response = await authorize(request("POST"), context);
      expect(response.status).toBe(400);
      return (await response.json()).error;
    };
    expect(await codeFor(new mocks.AppRequired())).toBe("oauth_app_required");
    expect(await codeFor(new mocks.ClientNotApproved())).toBe(
      "oauth_client_rejected",
    );
    expect(await codeFor(new Error("discovery"))).toBe("oauth");
  });
  it("uses optimistic endpoint matching and clears pending OAuth when editing", async () => {
    await PATCH(request("PATCH", { name: "Renamed" }), context);
    expect(mocks.calls[0]).toMatchObject({
      operation: "delete",
      filters: { user_id: "alice", connection_id: ID },
    });
    expect(mocks.calls[1]).toMatchObject({
      operation: "update",
      filters: { user_id: "alice", id: ID, url: "https://mcp.example.com/mcp" },
    });
  });
  it("routes both global and project assistant calls under the authenticated user", async () => {
    for (const projectId of [null, "project"]) {
      // MCP dispatch needs only the authenticated identity and conversation scope.
      const ctx = { userId: "alice", projectId } as ToolContext;
      await executeTool("list_mcp_tools", { user_id: "bob" }, ctx);
      expect(mocks.execute).toHaveBeenLastCalledWith(
        "alice",
        "list_mcp_tools",
        { user_id: "bob" },
      );
    }
  });
});
