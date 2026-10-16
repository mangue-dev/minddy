import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const h = vi.hoisted(() => ({
  user: "alice",
  /** project id → user ids that can read it (owner ∪ members), as RLS does. */
  access: new Map<string, Set<string>>(),
  trashed: new Set<string>(),
  /** The hidden_projects table: "user:project" → hidden_at. */
  rows: new Map<string, string>(),
  fail: false,
}));

/**
 * A database double that applies the same visibility rules as the real
 * policies: projects are readable by their owner and members, and
 * hidden_projects rows only by the user they belong to.
 */
function database() {
  return {
    from: (table: string) => {
      const filters: Record<string, string> = {};
      let deletedNull = false;
      const result = () => {
        if (h.fail) return { data: null, error: { message: "boom" } };
        if (table === "projects") {
          const id = filters.id;
          const visible = h.access.get(id)?.has(h.user) && !(deletedNull && h.trashed.has(id));
          return { data: visible ? { id } : null, error: null };
        }
        const data = [...h.rows.entries()]
          .map(([key, hidden_at]) => ({ user_id: key.split(":")[0], project_id: key.split(":")[1], hidden_at }))
          .filter((row) => row.user_id === h.user && (!filters.user_id || row.user_id === filters.user_id));
        return { data, error: null };
      };
      const q = {
        select: () => q,
        eq: (key: string, value: string) => { filters[key] = value; return q; },
        is: () => { deletedNull = true; return q; },
        order: async () => result(),
        maybeSingle: async () => result(),
        upsert: async (row: { user_id: string; project_id: string }) => {
          if (h.fail) return { error: { message: "boom" } };
          if (row.user_id !== h.user || !h.access.get(row.project_id)?.has(h.user)) {
            return { error: { message: "row-level security" } };
          }
          const key = `${row.user_id}:${row.project_id}`;
          if (!h.rows.has(key)) h.rows.set(key, new Date().toISOString());
          return { error: null };
        },
        delete: () => ({
          eq: (k1: string, v1: string) => ({
            eq: async (k2: string, v2: string) => {
              if (h.fail) return { error: { message: "boom" } };
              const f = { [k1]: v1, [k2]: v2 };
              if (f.user_id === h.user) h.rows.delete(`${f.user_id}:${f.project_id}`);
              return { error: null };
            },
          }),
        }),
      };
      return q;
    },
  };
}

vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: h.user }, supabase: database() }),
}));

const { GET } = await import("@/app/api/account/hidden-projects/route");
const { PUT, DELETE } = await import("@/app/api/account/hidden-projects/[projectId]/route");

type Req = Parameters<typeof GET>[0];
const req = (method = "GET") => new Request("http://localhost/api/account/hidden-projects", { method }) as Req;
const ctx = (projectId: string) => ({ params: Promise.resolve({ projectId }) });
const list = async () => (await GET(req())).json() as Promise<string[]>;

beforeEach(() => {
  h.user = "alice";
  h.access = new Map([[PROJECT, new Set(["alice", "bob"])], [OTHER, new Set(["bob"])]]);
  h.trashed = new Set();
  h.rows = new Map();
  h.fail = false;
});

describe("personal hidden projects", () => {
  it("hides a project for its member only and keeps it hidden across reads", async () => {
    expect((await PUT(req("PUT"), ctx(PROJECT))).status).toBe(204);
    expect(await list()).toEqual([PROJECT]);
    // Another member of the same project is unaffected.
    h.user = "bob";
    expect(await list()).toEqual([]);
  });

  it("is idempotent in both directions", async () => {
    await PUT(req("PUT"), ctx(PROJECT));
    expect((await PUT(req("PUT"), ctx(PROJECT))).status).toBe(204);
    expect(await list()).toEqual([PROJECT]);
    expect((await DELETE(req("DELETE"), ctx(PROJECT))).status).toBe(204);
    expect((await DELETE(req("DELETE"), ctx(PROJECT))).status).toBe(204);
    expect(await list()).toEqual([]);
  });

  it("refuses to hide a project the caller cannot access or that is in the trash", async () => {
    expect((await PUT(req("PUT"), ctx(OTHER))).status).toBe(404);
    h.trashed.add(PROJECT);
    expect((await PUT(req("PUT"), ctx(PROJECT))).status).toBe(404);
    expect((await PUT(req("PUT"), ctx("not-a-uuid"))).status).toBe(404);
    expect(h.rows.size).toBe(0);
  });

  it("showing only removes the caller's own preference", async () => {
    h.rows.set(`bob:${PROJECT}`, "2026-10-01T00:00:00Z");
    await DELETE(req("DELETE"), ctx(PROJECT));
    expect(h.rows.has(`bob:${PROJECT}`)).toBe(true);
  });

  it("reports a storage failure instead of claiming success", async () => {
    h.fail = true;
    expect((await PUT(req("PUT"), ctx(PROJECT))).status).toBe(500);
    expect((await DELETE(req("DELETE"), ctx(PROJECT))).status).toBe(500);
    expect((await GET(req())).status).toBe(500);
  });
});
