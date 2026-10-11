import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  patch: null as Record<string, unknown> | null,
  error: null as null | { message: string },
  authenticated: true,
  rpc: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => h.authenticated ? {
    ok: true, user: { id: "owner-1" },
    supabase: { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: h.error }) }) }),
    }) },
  } : { ok: false, response: new Response(null, { status: 401 }) },
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({
  rpc: h.rpc,
  from: (table: string) => {
    if (table !== "agent_branch_prefix_scope") throw new Error("Unexpected table");
    return { select: () => ({ eq: () => ({ maybeSingle: async () =>
      ({ data: null, error: { code: "42P01" } }) }) }) };
  },
}) }));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: vi.fn() }));
vi.mock("@/lib/server/agent/model", () => ({ userHasByokKey: vi.fn() }));

import { GET, PUT } from "@/app/api/account/agent-preferences/route";

function request(body?: unknown) {
  return new NextRequest("https://minddy.test/api/account/agent-preferences", body === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.row = { default_engine: "codex", default_model: "provider/model", branch_prefix: "work/", sandbox_region: "us", sandbox_size: "standard" };
  h.patch = null;
  h.error = null;
  h.authenticated = true;
  h.rpc.mockReset();
  h.rpc.mockImplementation((name: string, args: { p_user_id: string; p_values: Record<string, unknown> }) => {
    expect(name).toBe("upsert_agent_preferences_partial");
    expect(args.p_user_id).toBe("owner-1");
    return { single: async () => {
      h.patch = args.p_values;
      Object.assign(h.row, args.p_values);
      return { data: h.row, error: h.error };
    } };
  });
});

describe("account sandbox preferences API", () => {
  it("defaults an account without preferences to Europe and standard", async () => {
    h.row = {};
    expect(await (await GET(request())).json()).toMatchObject({ sandbox_region: "eu", sandbox_size: "standard" });
  });
  it("updates only the requested field for the authenticated account", async () => {
    const result = await PUT(request({ sandbox_size: "performance", user_id: "someone-else" }));
    expect(h.patch).toEqual({ sandbox_size: "performance" });
    expect(await result.json()).toMatchObject({
      default_engine: "codex", default_model: "provider/model", branch_prefix: "work/",
      sandbox_region: "us", sandbox_size: "performance",
    });
  });
  it("saves both supported preferences", async () => {
    const result = await PUT(request({ sandbox_region: "eu", sandbox_size: "performance" }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ sandbox_region: "eu", sandbox_size: "performance" });
  });
  it.each([
    { sandbox_region: "cdg1" }, { sandbox_region: null },
    { sandbox_size: "huge" }, { sandbox_size: 8 }, [],
  ])("rejects invalid preferences before writing: %j", async (body) => {
    expect((await PUT(request(body))).status).toBe(400);
    expect(h.patch).toBeNull();
  });
  it("surfaces read and write failures", async () => {
    h.error = { message: "Database unavailable" };
    expect((await GET(request())).status).toBe(500);
    expect((await PUT(request({ sandbox_region: "eu" }))).status).toBe(500);
  });
  it("requires authentication for reads and writes", async () => {
    h.authenticated = false;
    expect((await GET(request())).status).toBe(401);
    expect((await PUT(request({ sandbox_region: "us" }))).status).toBe(401);
    expect(h.patch).toBeNull();
  });
});
