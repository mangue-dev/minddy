import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  patch: null as Record<string, unknown> | null,
  error: null as null | { message: string },
  authenticated: true,
}));

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => h.authenticated ? {
    ok: true, user: { id: "owner-1" },
    supabase: { from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: h.error }) }) }),
      upsert: (patch: Record<string, unknown>) => {
        h.patch = patch;
        return { select: () => ({ single: async () => ({ data: { ...h.row, ...patch }, error: h.error }) }) };
      },
    }) },
  } : { ok: false, response: new Response(null, { status: 401 }) },
}));
vi.mock("@/lib/server/agent/model-plan", () => ({ ensureModelInPlan: vi.fn() }));
vi.mock("@/lib/server/agent/model", () => ({ userHasByokKey: vi.fn() }));

import { GET, PUT } from "@/app/api/account/agent-preferences/route";

function request(body?: unknown) {
  return new NextRequest("https://minddy.test/api/account/agent-preferences", body === undefined ? {} : {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.row = { default_model: "provider/model", branch_prefix: "work/", sandbox_region: "us", sandbox_size: "standard" };
  h.patch = null;
  h.error = null;
  h.authenticated = true;
});

describe("account sandbox preferences API", () => {
  it("defaults an account without preferences to Europe and standard", async () => {
    h.row = {};
    expect(await (await GET(request())).json()).toMatchObject({ sandbox_region: "eu", sandbox_size: "standard" });
  });
  it("updates only the requested field for the authenticated account", async () => {
    const result = await PUT(request({ sandbox_size: "performance", user_id: "someone-else" }));
    expect(h.patch).toEqual({ user_id: "owner-1", updated_at: expect.any(String), sandbox_size: "performance" });
    expect(await result.json()).toMatchObject({
      default_model: "provider/model", sandbox_region: "us", sandbox_size: "performance",
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
