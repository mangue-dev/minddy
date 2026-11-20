import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * MIN-1025: registering a device ties its row to the session that made the
 * request, so the database removes it when that session ends.
 */

type Call = { table: string; op: string; args: unknown[]; filters: [string, unknown][] };

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  protect: false,
  rpcRow: null as Record<string, unknown> | null,
  claims: {} as Record<string, unknown>,
}));

function query(table: string) {
  const call: Call = { table, op: "select", args: [], filters: [] };
  h.calls.push(call);
  const result = () => {
    if (call.op === "upsert") return { data: { id: "device-1", endpoint: "apns:" + "a".repeat(64) }, error: null };
    if (call.op === "update") return { data: null, error: null };
    return { data: [], error: null };
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    upsert: (...args: unknown[]) => { call.op = "upsert"; call.args = args; return builder; },
    update: (...args: unknown[]) => { call.op = "update"; call.args = args; return builder; },
    delete: () => { call.op = "delete"; return builder; },
    eq: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
    neq: () => builder,
    in: () => builder,
    single: async () => result(),
    then: (resolve: (value: unknown) => void) => resolve(result()),
  };
  return builder;
}

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: vi.fn(async () => ({
    ok: true,
    user: { id: "user-1" },
    supabase: {},
    claims: h.claims,
  })),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/server/capabilities", () => ({
  capability: () => ({ configured: true, diagnostic: "" }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (table: string) => query(table),
    rpc: async () => ({ data: h.rpcRow, error: null }),
  }),
}));
vi.mock("@/lib/server/push/content", () => ({
  shouldProtectPush: async () => h.protect,
  pushIndex: async () => "f".repeat(64),
  sealPush: async () => "sealed",
  openPush: async (row: unknown) => row,
  pushDevice: (row: unknown) => row,
}));

import { POST } from "@/app/api/account/push-subscriptions/route";

const SESSION = "3f2a9c81-0000-4000-8000-000000000001";

function register() {
  return POST(new NextRequest("http://localhost/api/account/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transport: "apns",
      endpoint: "apns:" + "a".repeat(64),
      installationId: "00000000-0000-4000-8000-000000000002",
      platform: "ios",
      environment: "production",
      locale: "en",
      refresh: true,
    }),
  }));
}

const sessionLinks = () =>
  h.calls.filter((call) =>
    call.op === "update" &&
    (call.args[0] as Record<string, unknown>)?.auth_session_id !== undefined);

beforeEach(() => {
  h.calls = [];
  h.protect = false;
  h.rpcRow = null;
  h.claims = { session_id: SESSION };
});

describe("push device registration and its session", () => {
  it("links the registered row to the caller's session", async () => {
    const response = await register();

    expect(response.status).toBe(200);
    const links = sessionLinks();
    expect(links).toHaveLength(1);
    expect(links[0].args[0]).toEqual({ auth_session_id: SESSION });
    expect(links[0].filters).toEqual([["id", "device-1"], ["user_id", "user-1"]]);
  });

  it("links a protected registration too", async () => {
    h.protect = true;
    h.rpcRow = { id: "device-2", auth_session_id: null };

    expect((await register()).status).toBe(200);
    expect(sessionLinks().map((call) => call.filters)).toEqual([
      [["id", "device-2"], ["user_id", "user-1"]],
    ]);
  });

  it("writes nothing when the row already belongs to this session", async () => {
    h.protect = true;
    h.rpcRow = { id: "device-2", auth_session_id: SESSION };

    expect((await register()).status).toBe(200);
    expect(sessionLinks()).toHaveLength(0);
  });

  it("still registers a request without a session claim", async () => {
    h.claims = {};

    expect((await register()).status).toBe(200);
    expect(sessionLinks()).toHaveLength(0);
  });
});
