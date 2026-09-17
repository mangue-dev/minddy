import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptMcpToken } from "./mcp-credentials";
import { MCP_PRESETS } from "@/lib/mcp-catalog";
import { executeMcpSetupTool } from "./mcp-setup";

const mocks = vi.hoisted(() => ({
  startOAuth: vi.fn(),
  rateLimit: vi.fn(),
  assertEndpoint: vi.fn(),
  db: {
    connections: [] as Array<Record<string, unknown>>,
    attempts: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("./mcp-client", () => ({
  getMcpConnection: async (userId: string, id: string) =>
    mocks.db.connections.find(
      (row) => row.user_id === userId && row.id === id,
    ) ?? null,
  listMcpConnections: async (userId: string) =>
    mocks.db.connections
      .filter((row) => row.user_id === userId)
      .map(({ user_id: _userId, ...row }) => row),
}));

vi.mock("./mcp-oauth", () => ({
  initialMcpOAuth: (clientId?: string, clientSecret?: string) =>
    JSON.stringify(
      clientId ? { client: { client_id: clientId, clientSecret } } : {},
    ),
  mcpOAuthCallback: () =>
    "https://app.example.com/api/account/mcp-connections/oauth/callback",
  startMcpOAuth: mocks.startOAuth,
}));

vi.mock("./session-rate-limit", () => ({
  checkSessionRateLimit: mocks.rateLimit,
}));

vi.mock("./safe-fetch", () => ({
  assertPublicHttpUrl: mocks.assertEndpoint,
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const rows =
        table === "user_mcp_connections"
          ? mocks.db.connections
          : mocks.db.attempts;
      const matches = (candidate: Record<string, unknown>) =>
        filters.every(([key, value]) => candidate[key] === value);
      const query = {
        insert: (values: Record<string, unknown>) => {
          query.pending = { kind: "insert", values };
          return query;
        },
        update: (values: Record<string, unknown>) => {
          query.pending = { kind: "update", values };
          return query;
        },
        delete: () => {
          query.pending = { kind: "delete" };
          return query;
        },
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        // Supabase builders are thenable: awaiting the chain runs the query
        // (a plain delete() is never terminated by single/maybeSingle).
        then: async (onFulfilled?: (value: unknown) => unknown) => {
          const { kind } = query.pending ?? {};
          if (kind === "delete") {
            for (let i = rows.length - 1; i >= 0; i--) {
              if (matches(rows[i])) rows.splice(i, 1);
            }
          }
          const result = { error: null };
          return onFulfilled ? onFulfilled(result) : result;
        },
        single: async () => {
          const pending = query.pending!;
          if (pending.kind === "insert" && pending.values) {
            const values = pending.values;
            values.id ??= crypto.randomUUID();
            rows.push(values);
            mocks.db.inserts.push(values);
            return { data: { id: values.id }, error: null };
          }
          throw new Error(`unexpected single ${pending.kind}`);
        },
        maybeSingle: async () => {
          const pending = query.pending;
          if (pending?.kind === "update" && pending.values) {
            for (const row of rows.filter(matches))
              Object.assign(row, pending.values);
            mocks.db.updates.push(pending.values);
          }
          return { data: rows.find(matches) ?? null, error: null };
        },
        pending: null as
          | { kind: "insert" | "update" | "delete"; values?: Record<string, unknown> }
          | null,
      };
      return query;
    },
  }),
}));

const USER = "0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f";
const CONNECTION_ID = "33b8b032-d967-4f06-aabd-dc165e988335";
const AUTH_URL = "https://auth.example.com/authorize?state=abc";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    user_id: USER,
    name: "Existing",
    url: "https://mcp.example.com/mcp",
    enabled: true,
    created_at: "2026-09-17",
    transport: "http",
    auth_mode: "oauth",
    oauth_connected: false,
    token_encrypted: null,
    headers_encrypted: null,
    oauth_encrypted: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv(
    "AI_KEY_ENCRYPTION_SECRET",
    "test-secret-with-at-least-thirty-two-characters",
  );
  mocks.db.connections = [];
  mocks.db.attempts = [];
  mocks.db.inserts = [];
  mocks.db.updates = [];
  mocks.startOAuth.mockReset().mockResolvedValue(AUTH_URL);
  mocks.rateLimit.mockReset().mockReturnValue({ allowed: true, retryAfter: 0 });
  mocks.assertEndpoint.mockReset().mockResolvedValue({});
});

describe("list_mcp_presets", () => {
  it("returns the catalog with setup notes and the user's connections", async () => {
    mocks.db.connections = [row({ auth_mode: "bearer" })];
    const execution = await executeMcpSetupTool(USER, "list_mcp_presets", {});

    expect(execution.success).toBe(true);
    const result = execution.result as {
      presets: Array<{ id: string; setup_note: string; url: string }>;
      connections: Array<{ id: string; needs_auth: boolean }>;
      settings_url: string;
    };
    expect(result.presets.map((preset) => preset.id)).toEqual(
      MCP_PRESETS.map((preset) => preset.id),
    );
    expect(result.presets[0].setup_note).toBeTruthy();
    // A google preset carries the developer-preview note.
    const gmail = result.presets.find((preset) => preset.id === "google-gmail");
    expect(gmail?.setup_note).toMatch(/developer preview/i);
    expect(result.connections).toEqual([
      expect.objectContaining({ id: CONNECTION_ID, needs_auth: true }),
    ]);
    expect(result.settings_url).toContain("tab=mcp-clients");
    // No credential material ever leaves the row summaries.
    expect(JSON.stringify(result)).not.toMatch(/encrypted/);
  });
});

describe("configure_mcp_connection — creation", () => {
  it("creates an enabled OAuth connection from a preset and returns the authorization URL", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { preset_id: "notion" },
    );

    expect(execution.success).toBe(true);
    const result = execution.result as {
      created: boolean;
      authorization_url?: string;
      callback_url: string;
      connection: { name: string; url: string; auth_mode: string; enabled: boolean; oauth_connected: boolean };
      next_steps: string[];
      settings_url: string;
    };
    expect(mocks.db.inserts).toEqual([
      expect.objectContaining({
        user_id: USER,
        name: "Notion",
        url: MCP_PRESETS.find((preset) => preset.id === "notion")!.url,
        auth_mode: "oauth",
        enabled: true,
      }),
    ]);
    expect(result.connection).toMatchObject({
      name: "Notion",
      auth_mode: "oauth",
      enabled: true,
      oauth_connected: false,
      needs_auth: true,
    });
    expect(result.authorization_url).toBe(AUTH_URL);
    expect(result.callback_url).toContain("/api/account/mcp-connections/oauth/callback");
    expect(result.next_steps.join(" ")).toMatch(/authorization URL/);
    expect(result.settings_url).toContain("mcp_connection=");
    expect(mocks.startOAuth).toHaveBeenCalledOnce();
  });

  it("carries the provider prerequisite note for a google preset", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { preset_id: "google-gmail" },
    );

    const result = execution.result as { next_steps: string[] };
    expect(result.next_steps.join(" ")).toMatch(/developer preview/i);
    expect(result.next_steps.join(" ")).toMatch(/OAuth app/i);
  });

  it("creates a custom server with an explicit name and url", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { name: "Acme", url: "https://mcp.acme.dev/sse", transport: "sse" },
    );

    expect(execution.success).toBe(true);
    expect(mocks.db.inserts).toEqual([
      expect.objectContaining({
        name: "Acme",
        url: "https://mcp.acme.dev/sse",
        auth_mode: "oauth",
        transport: "sse",
      }),
    ]);
  });

  it("defaults to bearer and encrypts the token the user pasted, never echoing it back", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      {
        name: "GitHub",
        url: "https://api.githubcopilot.com/mcp/",
        token: "ghp_supersecret",
      },
    );

    expect(execution.success).toBe(true);
    const inserted = mocks.db.inserts[0] as {
      auth_mode: string;
      token_encrypted: string;
    };
    expect(inserted.auth_mode).toBe("bearer");
    expect(decryptMcpToken(inserted.token_encrypted)).toBe("ghp_supersecret");
    const result = execution.result as { connection: { needs_auth: boolean } };
    expect(result.connection.needs_auth).toBe(false);
    expect(JSON.stringify(execution.result)).not.toContain("ghp_supersecret");
  });

  it("explains the missing bearer token when none was provided", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { name: "GitHub", url: "https://api.githubcopilot.com/mcp/", auth_mode: "bearer" },
    );

    expect(execution.success).toBe(true);
    const result = execution.result as {
      connection: { auth_mode: string; needs_auth: boolean };
      next_steps: string[];
    };
    expect(result.connection).toMatchObject({ auth_mode: "bearer", needs_auth: true });
    expect(result.next_steps.join(" ")).toMatch(/bearer token/i);
  });

  it("returns the existing connection instead of duplicating an endpoint", async () => {
    const notionUrl = MCP_PRESETS.find((preset) => preset.id === "notion")!.url;
    mocks.db.connections = [row({ url: notionUrl })];
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { preset_id: "notion" },
    );

    expect(mocks.db.inserts).toEqual([]);
    expect(execution.success).toBe(true);
    const result = execution.result as {
      reused: boolean;
      connection: { id: string };
      note: string;
    };
    expect(result.reused).toBe(true);
    expect(result.connection.id).toBe(CONNECTION_ID);
    expect(result.note).toMatch(/already exists/i);
  });

  it("refuses an unknown preset, a non-HTTPS endpoint and a blocked endpoint", async () => {
    const unknown = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { preset_id: "gmail" },
    );
    expect(unknown).toMatchObject({ success: false });

    const insecure = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { name: "Local", url: "http://localhost:3000/mcp" },
    );
    expect(insecure).toMatchObject({ success: false });

    mocks.assertEndpoint.mockRejectedValue(new Error("private network"));
    const blocked = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { name: "Internal", url: "https://internal.example.com/mcp" },
    );
    expect(blocked).toMatchObject({ success: false });
  });

  it("refuses without a preset when the name or the url is missing", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { name: "Half" },
    );
    expect(execution).toMatchObject({ success: false });
  });

  it("honors the mcp-settings rate limit", async () => {
    mocks.rateLimit.mockReturnValue({ allowed: false, retryAfter: 30 });
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { preset_id: "notion" },
    );
    expect(mocks.db.inserts).toEqual([]);
    expect(execution).toMatchObject({ success: false });
    expect(JSON.stringify(execution.result)).toMatch(/[Rr]etry/);
  });
});

describe("configure_mcp_connection — update", () => {
  beforeEach(() => {
    mocks.db.connections = [row()];
    mocks.db.attempts = [{ connection_id: CONNECTION_ID, user_id: USER }];
  });

  it("adds OAuth app credentials and restarts the flow", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      {
        connection_id: CONNECTION_ID,
        oauth_client_id: "client-123",
        oauth_client_secret: "secret-456",
      },
    );

    expect(execution.success).toBe(true);
    expect(mocks.db.updates).toEqual([
      expect.objectContaining({ oauth_connected: false }),
    ]);
    const updated = mocks.db.connections[0];
    // The mocked initialMcpOAuth stores plaintext JSON in tests.
    expect(JSON.parse(updated.oauth_encrypted as string)).toEqual({
      client: { client_id: "client-123", clientSecret: "secret-456" },
    });
    expect(mocks.db.attempts).toEqual([]);
    const result = execution.result as {
      updated: boolean;
      authorization_url?: string;
    };
    expect(result.updated).toBe(true);
    expect(result.authorization_url).toBe(AUTH_URL);
    expect(JSON.stringify(execution.result)).not.toContain("secret-456");
  });

  it("re-mints the authentication step when nothing changes", async () => {
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { connection_id: CONNECTION_ID },
    );

    expect(mocks.db.updates).toEqual([]);
    expect(execution.success).toBe(true);
    const result = execution.result as { updated: boolean; authorization_url?: string };
    expect(result.updated).toBe(false);
    expect(result.authorization_url).toBe(AUTH_URL);
  });

  it("falls back to settings guidance when the OAuth flow cannot start", async () => {
    mocks.startOAuth.mockRejectedValue(new Error("discovery failed"));
    const execution = await executeMcpSetupTool(
      USER,
      "configure_mcp_connection",
      { connection_id: CONNECTION_ID },
    );

    expect(execution.success).toBe(true);
    const result = execution.result as {
      authorization_url?: string;
      next_steps: string[];
      callback_url: string;
    };
    expect(result.authorization_url).toBeUndefined();
    expect(result.next_steps.join(" ")).toMatch(/Sign in/i);
    expect(result.callback_url).toContain("/oauth/callback");
  });
});
