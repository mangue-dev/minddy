import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  allowed: true,
  visible: true,
  deleted: [] as Array<Record<string, unknown>>,
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/server/categories", () => ({ updateCategory: vi.fn() }));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: async () => state.allowed ? { role: "member" } : null,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "actor-1" }, supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
      data: state.visible ? { id: "category-1", project_id: "project-1" } : null, error: null,
    }) }) }) }),
  } }),
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
    state.deleted.push({ name, ...args });
    return { data: true, error: null };
  } }),
}));

import { DELETE } from "@/app/api/categories/[id]/route";

const request = () => new NextRequest("http://localhost/api/categories/category-1");
const params = { params: Promise.resolve({ id: "category-1" }) };

beforeEach(() => {
  state.allowed = state.visible = true;
  state.deleted.length = 0;
});

it("checks category visibility and project access before service-role deletion", async () => {
  state.visible = false;
  expect((await DELETE(request(), params)).status).toBe(404);
  expect(state.deleted).toEqual([]);
  state.visible = true;
  state.allowed = false;
  expect((await DELETE(request(), params)).status).toBe(404);
  expect(state.deleted).toEqual([]);
  state.allowed = true;
  const response = await DELETE(request(), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(state.deleted).toEqual([{ name: "delete_category_guarded", p_id: "category-1",
    p_project_id: "project-1", p_actor_id: "actor-1" }]);
});
