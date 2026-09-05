import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { auth } from "@modelcontextprotocol/client";
import { mcpFetch } from "./mcp-http";
import {
  startMcpOAuth,
  completeMcpOAuth,
  initialMcpOAuth,
  openMcpOAuth,
} from "./mcp-oauth";
import { decryptMcpToken, encryptMcpToken } from "./mcp-credentials";
import { mcpSettingsUpdate } from "./mcp-settings";
import type { McpConnectionRow } from "./mcp-client";

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  requests: [] as Array<{
    url: string;
    body: string;
    method: string;
    headers: Headers;
  }>,
  failSave: false,
  challenge: null as string | null,
  challengeOnly: false,
  postOnly: false,
  streaming: false,
  canceled: 0,
  session: false,
}));
vi.mock("./app-origin", () => ({
  canonicalAppOrigin: () => "https://minddy.test",
}));
vi.mock("./safe-fetch", () => ({
  assertPublicHttpUrl: async (url: URL) => ({ url, address: "1.1.1.1" }),
  safeFetchResponse: async (url: string, init: RequestInit) => {
    state.requests.push({
      url,
      body: String(init.body ?? ""),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
    });
    if (url === "https://mcp.example.com/mcp") {
      if (init.method === "DELETE")
        return new Response(null, { status: 204 });
      if (state.postOnly && init.method === "GET")
        return new Response(null, { status: 405 });
      if (state.session)
        return Response.json({}, { headers: { "mcp-session-id": "probe-session" } });
      if (state.challenge || state.streaming)
        return new Response(
          new ReadableStream({
            cancel() { state.canceled += 1; },
          }),
          {
            status: state.challenge ? 401 : 200,
            headers: state.challenge
              ? { "WWW-Authenticate": state.challenge }
              : { "Content-Type": "text/event-stream" },
          },
        );
    }
    if (state.challengeOnly && url.includes("oauth-protected-resource"))
      return new Response(null, { status: 404 });
    if (
      url.includes("oauth-protected-resource") ||
      url === "https://mcp.example.com/auth/resource"
    )
      return Response.json({
        resource: "https://mcp.example.com/mcp",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["tools:read", "tools:write"],
      });
    if (url.includes("oauth-authorization-server"))
      return Response.json({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      });
    if (url.endsWith("/register"))
      return Response.json({
        ...JSON.parse(String(init.body)),
        client_id: "registered-client",
      });
    if (url.endsWith("/token"))
      return Response.json({
        access_token: "private-access-token",
        token_type: "Bearer",
        refresh_token: "private-refresh-token",
        expires_in: 3600,
      });
    return new Response(null, { status: 404 });
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      let operation = "read";
      let values: Record<string, unknown> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        gt: (key: string, value: string) => {
          filters.push((row) => String(row[key]) > value);
          return query;
        },
        or: () => {
          filters.push(
            (row) =>
              !row.oauth_lock_until ||
              String(row.oauth_lock_until) < new Date().toISOString(),
          );
          return query;
        },
        insert: (input: Record<string, unknown>) => {
          operation = "insert";
          values = input;
          return query;
        },
        update: (input: Record<string, unknown>) => {
          operation = "update";
          values = input;
          return query;
        },
        delete: () => {
          operation = "delete";
          return query;
        },
        maybeSingle: async () => {
          const result = execute();
          return { ...result, data: result.data[0] ?? null };
        },
        then: (resolve: (result: ReturnType<typeof execute>) => void) =>
          resolve(execute()),
      };
      function execute() {
        const rows = state.tables[table] ?? [];
        const matching = rows.filter((row) =>
          filters.every((filter) => filter(row)),
        );
        if (state.failSave && operation === "update")
          return { data: [], error: "failed" };
        if (operation === "insert")
          rows.push({
            expires_at: new Date(Date.now() + 600000).toISOString(),
            ...values,
          });
        if (operation === "update")
          matching.forEach((row) => Object.assign(row, values));
        state.tables[table] =
          operation === "delete"
            ? rows.filter((row) => !matching.includes(row))
            : rows;
        return { data: matching.map((row) => ({ ...row })), error: null };
      }
      return query;
    },
  }),
}));
const connection: McpConnectionRow = {
  id: "33b8b032-d967-4f06-aabd-dc165e988335",
  user_id: "alice",
  name: "Tools",
  url: "https://mcp.example.com/mcp",
  enabled: true,
  created_at: "2026-09-04",
  token_encrypted: null,
  headers_encrypted: null,
  oauth_encrypted: null,
  transport: "http",
  auth_mode: "oauth",
  oauth_connected: false,
};
beforeEach(() => {
  vi.stubEnv(
    "AI_KEY_ENCRYPTION_SECRET",
    "test-secret-with-at-least-thirty-two-characters",
  );
  state.tables = {
    user_mcp_connections: [{ ...connection }],
    user_mcp_oauth_attempts: [],
  };
  state.requests = [];
  state.failSave = false;
  state.challenge = null;
  state.challengeOnly = false;
  state.postOnly = false;
  state.streaming = false;
  state.canceled = 0;
  state.session = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generic MCP OAuth", () => {
  it.each(["http", "sse"] as const)("follows %s challenges and preserves the challenged scope", async (transport) => {
    state.challengeOnly = true;
    state.challenge = 'Bearer resource_metadata="https://mcp.example.com/auth/resource", scope="tools:read"';
    const url = new URL(await startMcpOAuth({ ...connection, transport }));
    expect(url.origin).toBe("https://auth.example.com");
    expect(url.searchParams.get("scope")).toBe("tools:read");
    expect(state.requests[0].url).toBe(connection.url);
    expect(state.requests.some((request) =>
      request.url.includes("oauth-protected-resource"),
    )).toBe(false);
    await vi.waitFor(() => expect(state.canceled).toBe(1));
    const payload = JSON.parse(decryptMcpToken(
      String(state.tables.user_mcp_oauth_attempts[0].payload_encrypted),
    )!);
    expect(payload).toMatchObject({
      scope: "tools:read",
      discovery: { resourceMetadataUrl: "https://mcp.example.com/auth/resource" },
    });
    const registration = state.requests.find((request) =>
      request.url.endsWith("/register"),
    )!;
    expect(JSON.parse(registration.body).scope).toBe("tools:read");
    await completeMcpOAuth("alice", url.searchParams.get("state")!, "code");
    expect(state.tables.user_mcp_connections[0].oauth_connected).toBe(true);
  });
  it("reads a POST-only challenge when Streamable HTTP rejects GET", async () => {
    state.postOnly = true;
    state.challengeOnly = true;
    state.challenge = 'Bearer resource_metadata="https://mcp.example.com/auth/resource", scope="tools:read"';
    const url = new URL(await startMcpOAuth(connection));
    expect(url.searchParams.get("scope")).toBe("tools:read");
    const requests = state.requests.filter((request) =>
      request.url === connection.url,
    );
    expect(requests.map((request) => request.method)).toEqual(["GET", "POST"]);
    expect(JSON.parse(requests[1].body)).toMatchObject({ method: "initialize" });
    expect(requests[1].headers.get("content-type")).toBe("application/json");
    await vi.waitFor(() => expect(state.canceled).toBe(1));
  });
  it("closes an unchallenged SSE stream before falling back to well-known discovery", async () => {
    state.streaming = true;
    const url = new URL(await startMcpOAuth({ ...connection, transport: "sse" }));
    expect(url.origin).toBe("https://auth.example.com");
    expect(url.searchParams.get("scope")).toBe("tools:read tools:write");
    await vi.waitFor(() => expect(state.canceled).toBe(1));
    expect(state.requests.filter((request) =>
      request.url === connection.url,
    )).toHaveLength(1);
  });
  it("closes a probe session and keeps custom headers on the resource server", async () => {
    state.postOnly = true;
    state.session = true;
    await startMcpOAuth({
      ...connection,
      headers_encrypted: encryptMcpToken(JSON.stringify({ "X-API-Key": "private-header" })),
    });
    const resourceRequests = state.requests.filter((request) =>
      request.url === connection.url,
    );
    expect(resourceRequests.map((request) => request.method)).toEqual(["GET", "POST", "DELETE"]);
    expect(resourceRequests[2].headers.get("mcp-session-id")).toBe("probe-session");
    for (const request of state.requests) {
      expect(request.headers.get("x-api-key")).toBe(
        request.url === connection.url ? "private-header" : null,
      );
    }
  });
  it("discovers and registers with the actual SDK, persists PKCE, and exchanges a single-use callback", async () => {
    const url = new URL(await startMcpOAuth(connection));
    expect(url.origin).toBe("https://auth.example.com");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://minddy.test/api/account/mcp-connections/oauth/callback",
    );
    const attempt = state.tables.user_mcp_oauth_attempts[0];
    expect(String(attempt.payload_encrypted)).not.toContain("verifier");
    const payload = JSON.parse(
      decryptMcpToken(String(attempt.payload_encrypted))!,
    );
    expect(payload.verifier).toBeTruthy();
    expect(payload.discovery).toBeTruthy();
    await completeMcpOAuth(
      "alice",
      url.searchParams.get("state")!,
      "code",
      "https://auth.example.com",
    );
    const saved = state.tables.user_mcp_connections[0];
    expect(saved.oauth_connected).toBe(true);
    expect(saved.oauth_lock_token).toBeNull();
    expect(
      JSON.parse(decryptMcpToken(String(saved.oauth_encrypted))!).tokens
        .refresh_token,
    ).toBe("private-refresh-token");
    const tokenRequest = new URLSearchParams(
      state.requests.find((request) => request.url.endsWith("/token"))?.body,
    );
    expect(tokenRequest.get("code_verifier")).toBe(payload.verifier);
    await expect(
      completeMcpOAuth("alice", url.searchParams.get("state")!, "code"),
    ).rejects.toThrow("expired or already used");
  });
  it("refreshes an authorized account without another browser redirect", async () => {
    const url = new URL(await startMcpOAuth(connection));
    await completeMcpOAuth("alice", url.searchParams.get("state")!, "code");
    const oauth = await openMcpOAuth(connection);
    try {
      expect(
        await auth(oauth.provider, {
          serverUrl: connection.url,
          fetchFn: mcpFetch(AbortSignal.timeout(1000)),
        }),
      ).toBe("AUTHORIZED");
      const requests = state.requests.filter((request) =>
        request.url.endsWith("/token"),
      );
      expect(requests).toHaveLength(2);
      expect(requests[1].body).toContain("grant_type=refresh_token");
      expect(requests[1].body).toContain("refresh_token=private-refresh-token");
      expect(oauth.secrets()).toContain("private-access-token");
    } finally {
      await oauth.release();
    }
  });
  it("rejects foreign accounts and expired states before exchanging a code", async () => {
    const url = new URL(await startMcpOAuth(connection));
    const nonce = url.searchParams.get("state")!;
    await expect(completeMcpOAuth("bob", nonce, "code")).rejects.toThrow();
    state.tables.user_mcp_oauth_attempts[0].expires_at = "2000-01-01T00:00:00Z";
    await expect(completeMcpOAuth("alice", nonce, "code")).rejects.toThrow();
    expect(
      state.requests.some((request) => request.url.endsWith("/token")),
    ).toBe(false);
  });
  it("rejects callback issuer mismatches and changed or deleted connections", async () => {
    let url = new URL(await startMcpOAuth(connection));
    await expect(
      completeMcpOAuth(
        "alice",
        url.searchParams.get("state")!,
        "code",
        "https://attacker.example",
      ),
    ).rejects.toThrow();
    expect(
      state.requests.some((request) => request.url.endsWith("/token")),
    ).toBe(false);
    url = new URL(await startMcpOAuth(connection));
    state.tables.user_mcp_connections[0].url = "https://different.example/mcp";
    await expect(
      completeMcpOAuth("alice", url.searchParams.get("state")!, "code"),
    ).rejects.toThrow("changed");
  });
  it("supports pre-registered clients and keeps their secrets encrypted", async () => {
    const configured = {
      ...connection,
      oauth_encrypted: initialMcpOAuth("custom-client", "custom-secret"),
    };
    const url = new URL(await startMcpOAuth(configured));
    expect(url.searchParams.get("client_id")).toBe("custom-client");
    expect(
      state.requests.some((request) => request.url.endsWith("/register")),
    ).toBe(false);
    expect(configured.oauth_encrypted).not.toContain("custom-secret");
  });
  it("serializes refreshes and refuses writes after credentials are edited", async () => {
    const oauth = await openMcpOAuth(connection);
    await expect(openMcpOAuth(connection)).rejects.toThrow("busy or changed");
    state.tables.user_mcp_connections[0].oauth_lock_token = null;
    await expect(
      oauth.provider.saveTokens({
        access_token: "new-token",
        token_type: "Bearer",
      }),
    ).rejects.toThrow("changed");
    await oauth.release();
    expect(state.tables.user_mcp_connections[0].oauth_encrypted).toBeNull();
  });
  it("clears credentials on endpoint changes and encrypts custom headers", () => {
    const current = {
      ...connection,
      auth_mode: "bearer" as const,
      token_encrypted: "old",
      headers_encrypted: "old-headers",
    };
    const renamed = mcpSettingsUpdate({ name: "Renamed" }, current);
    expect(renamed).not.toHaveProperty("token_encrypted");
    const changed = mcpSettingsUpdate(
      { url: "https://other.example/mcp" },
      current,
    );
    expect(changed).toMatchObject({
      token_encrypted: null,
      headers_encrypted: null,
      oauth_connected: false,
    });
    const custom = mcpSettingsUpdate(
      { headers: { "X-API-Key": "secret-header" } },
      current,
    );
    expect(custom.headers_encrypted).not.toContain("secret-header");
    expect(decryptMcpToken(custom.headers_encrypted ?? null)).toBe(
      '{"X-API-Key":"secret-header"}',
    );
  });
});
