import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Round trips of GET /api/projects/[id]/views, the last key a retained board
 * waits for. The RLS list read must not wait for the access check, a list that
 * already holds the baseline needs no seeding read, and decoded rows never
 * leave for a project the caller cannot access.
 */

const USER = "user-1";

type Row = Record<string, unknown>;

const world = {
  views: [] as Row[],
  /** Read and write events, in issue order. */
  log: [] as string[],
};

let releaseAccess: (value: unknown) => void = () => {};
const access = vi.fn(() => new Promise((resolve) => { releaseAccess = resolve; }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: USER }, supabase: rls }),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: () => access(),
  hasProjectAccess: () => access(),
}));

const decodeView = vi.fn(async (row: Row) => ({ ...row, decoded: true }));
vi.mock("@/lib/server/view-content", () => ({
  decodeView,
  encodeView: async (row: Row) => row,
  viewContentValues: (row: Row) => row,
}));

const visible = (projectId: unknown) => world.views.filter((row) => row.project_id === projectId);

const rls = {
  from: () => {
    let projectId: unknown = null;
    const query = {
      select: () => query,
      order: () => query,
      eq: (_column: string, value: unknown) => {
        projectId = value;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        world.log.push("rls-list");
        return Promise.resolve({ data: visible(projectId), error: null }).then(resolve);
      },
    };
    return query;
  },
};

vi.mock("@/lib/supabase-service", () => {
  const from = () => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      or: () => query,
      is: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => {
        world.log.push("service-system-lookup");
        await new Promise((resolve) => setTimeout(resolve, 0));
        world.log.push("service-system-resolved");
        const row = visible(filters.project_id)
          .find((view) => view.kind === "my" && view.user_id === filters.user_id);
        return { data: row ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        world.log.push("service-custom-count");
        const count = visible(filters.project_id).filter((view) => view.kind === "custom").length;
        return Promise.resolve({ count, error: null }).then(resolve);
      },
      insert: async (row: Row) => {
        world.log.push(`service-insert-${String(row.kind)}`);
        world.views.push(row);
        return { error: null };
      },
    };
    return query;
  };
  return { getServiceClient: () => ({ from }) };
});

const { GET } = await import("@/app/api/projects/[id]/views/route");

const call = (projectId: string) => GET(
  new NextRequest(`https://minddy.test/api/projects/${projectId}/views`),
  { params: Promise.resolve({ id: projectId }) },
);

beforeEach(() => {
  world.views = [];
  world.log = [];
  access.mockClear();
  decodeView.mockClear();
});

describe("GET /api/projects/[id]/views", () => {
  it("reads the list alongside the access check and skips seeding reads when the baseline exists", async () => {
    world.views = [
      { id: "my", project_id: "p-baseline", user_id: USER, kind: "my" },
      { id: "all", project_id: "p-baseline", user_id: null, kind: "custom" },
    ];
    const response = call("p-baseline");
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    await vi.waitFor(() => expect(world.log).toContain("rls-list"));
    releaseAccess({ isOwner: true });
    const body = await (await response).json();
    expect(body.map((row: Row) => row.id)).toEqual(["my", "all"]);
    expect(world.log).toEqual(["rls-list"]);
  });

  it("answers 404 without decoding a row when access is denied", async () => {
    world.views = [{ id: "all", project_id: "p-denied", user_id: null, kind: "custom" }];
    const response = call("p-denied");
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    releaseAccess(null);
    expect((await response).status).toBe(404);
    expect(decodeView).not.toHaveBeenCalled();
    expect(world.log.filter((entry) => entry.startsWith("service-"))).toEqual([]);
  });

  it("seeds a missing baseline with both checks started together, then lists it", async () => {
    const response = call("p-empty");
    await vi.waitFor(() => expect(access).toHaveBeenCalled());
    releaseAccess({ isOwner: true });
    const body = await (await response).json();
    expect(body.map((row: Row) => row.kind).sort()).toEqual(["custom", "my"]);
    expect(world.log.indexOf("service-custom-count"))
      .toBeLessThan(world.log.indexOf("service-system-resolved"));
    expect(world.log.filter((entry) => entry.startsWith("service-insert")))
      .toEqual(["service-insert-my", "service-insert-custom"]);
    expect(world.log.at(-1)).toBe("rls-list");
  });
});
