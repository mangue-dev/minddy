import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `reorderCategories` (MIN-760): the core shared by the settings route and the
 * Numo and MCP tools. The ordering itself runs in SQL (`reorder_categories`);
 * these tests pin what the core owns: input validation, the access check
 * before the service-role call, and the mapping of the function's outcomes.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  access: { canWrite: true } as { canWrite: boolean } | null,
  rpc: { data: null as unknown, error: null as { code?: string; message: string } | null },
  calls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => state.access,
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.calls.push({ name, args });
      return state.rpc;
    },
  }),
}));
vi.mock("@/lib/server/category-store", () => ({
  categoryStore: () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: state.rows, error: null }).then(resolve),
    };
    return query;
  },
  decodeCategory: vi.fn(),
  encodeCategory: vi.fn(),
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "actor-1" }, supabase: {} }),
}));

const { reorderCategories } = await import("@/lib/server/categories");
const { PUT } = await import("@/app/api/projects/[id]/categories/order/route");

const reorder = (categoryIds: unknown) =>
  reorderCategories({ projectId: "project-1", actorId: "actor-1", categoryIds });

beforeEach(() => {
  state.access = { canWrite: true };
  state.rpc = { data: { category_ids: [B, A] }, error: null };
  state.calls.length = 0;
  state.rows = [
    { id: B, name: "Feature", color: "#00f", position: 0 },
    { id: A, name: "Bug", color: "#f00", position: 1 },
  ];
});

describe("reorderCategories", () => {
  it("rejects malformed lists before reaching the database", async () => {
    for (const ids of [undefined, [], [A, A], ["not-a-uuid"], [A, 3]]) {
      expect(await reorder(ids)).toMatchObject({ ok: false, status: 400, errorKey: "invalidRequest" });
    }
    expect(state.calls).toEqual([]);
  });

  it("checks project access before the service-role write", async () => {
    state.access = null;
    expect(await reorder([B])).toMatchObject({ ok: false, status: 404, errorKey: "projectNotFound" });
    state.access = { canWrite: false };
    expect(await reorder([B])).toMatchObject({ ok: false, status: 403, errorKey: "readOnlyProject" });
    expect(state.calls).toEqual([]);
  });

  it("passes the order to the SQL function and returns the new order", async () => {
    const result = await reorder([B]);
    expect(state.calls).toEqual([{ name: "reorder_categories",
      args: { p_project_id: "project-1", p_actor_id: "actor-1", p_category_ids: [B] } }]);
    expect(result).toEqual({ ok: true, categories: state.rows });
  });

  it("maps the function's refusals", async () => {
    state.rpc = { data: { code: "not_found" }, error: null };
    expect(await reorder([B])).toMatchObject({ status: 404, errorKey: "categoryNotFound" });
    state.rpc = { data: { code: "duplicate" }, error: null };
    expect(await reorder([B])).toMatchObject({ status: 400, errorKey: "invalidRequest" });
    state.rpc = { data: null, error: { code: "42501", message: "tenant_guard_forbidden" } };
    expect(await reorder([B])).toMatchObject({ status: 403, errorKey: "readOnlyProject" });
  });
});

describe("PUT /api/projects/[id]/categories/order", () => {
  const params = { params: Promise.resolve({ id: "project-1" }) };
  const request = (body: string) => new NextRequest(
    "http://localhost/api/projects/project-1/categories/order", { method: "PUT", body });

  it("returns the categories in their new order", async () => {
    const response = await PUT(request(JSON.stringify({ category_ids: [B, A] })), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(state.rows);
  });

  it("refuses an unreadable body and a missing list", async () => {
    expect((await PUT(request("{"), params)).status).toBe(400);
    const response = await PUT(request("{}"), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalidRequest" });
    expect(state.calls).toEqual([]);
  });
});
