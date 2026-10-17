import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * GET /api/issues/semantic-search (MIN-718): the scope comes from the user's
 * own RLS client only, and the response carries ids, never content.
 */

const h = vi.hoisted(() => ({
  projects: [] as { id: string }[],
  filters: [] as [string, unknown][],
  search: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session-rate-limit", () => ({ checkSessionRateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/server/issue-semantic-search", () => ({
  SEMANTIC_MAX_PROJECTS: 25,
  searchIssuesSemantically: h.search,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({
    ok: true,
    user: { id: "u1" },
    supabase: {
      from: () => {
        const q = {
          select: () => q,
          is: () => q,
          order: () => q,
          limit: () => q,
          eq(column: string, value: unknown) { h.filters.push([column, value]); return q; },
          then(resolve: (value: unknown) => unknown) {
            const rows = h.projects.filter((p) => h.filters.every(([c, v]) => c !== "id" || p.id === v));
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          },
        };
        return q;
      },
    },
  }),
}));

const { GET } = await import("@/app/api/issues/semantic-search/route");
const call = (query: string) => GET(new NextRequest(`http://localhost/api/issues/semantic-search?${query}`));
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  h.projects = [{ id: P1 }, { id: P2 }];
  h.filters = [];
  h.search.mockReset().mockResolvedValue({
    status: "ok", hits: [{ id: "i1", project_id: P1, score: 0.8 }],
  });
});

describe("GET /api/issues/semantic-search", () => {
  it("searches the projects RLS returns and answers ids without scores or content", async () => {
    const response = await call("q=single%20sign-on%20login");
    expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", projectIds: [P1, P2] }));
    await expect(response.json()).resolves.toEqual({ status: "ok", hits: [{ id: "i1", project_id: P1 }] });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("narrows to one project, and finds nothing in a project RLS does not return", async () => {
    await call(`q=single%20sign-on&project=${P1}`);
    expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ projectIds: [P1] }));
    h.projects = [{ id: P1 }];
    h.filters = [];
    await call(`q=single%20sign-on&project=${P2}`);
    expect(h.search).toHaveBeenLastCalledWith(expect.objectContaining({ projectIds: [] }));
  });

  it("ignores a malformed project id", async () => {
    const response = await call("q=single%20sign-on&project=not-a-uuid");
    await expect(response.json()).resolves.toEqual({ status: "ok", hits: [] });
    expect(h.search).not.toHaveBeenCalled();
  });
});
