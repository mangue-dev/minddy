import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setIssueCategories } from "./set-issue-categories";

const { insertEvents, getProjectAccess } = vi.hoisted(() => ({
  insertEvents: vi.fn(),
  getProjectAccess: vi.fn(async () => ({ role: "member" })),
}));
let service: SupabaseClient;
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...await importOriginal<typeof import("./issue-events")>(),
  insertEvents,
}));

const ISSUE_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000002";
const OLD_CATEGORY = "00000000-0000-4000-8000-000000000003";
const NEW_CATEGORY = "00000000-0000-4000-8000-000000000004";

function database(failure?: { table: string; code: string }) {
  const requests: Request[] = [];
  const state = { categoryIds: [OLD_CATEGORY] };
  service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const table = new URL(request.url).pathname.split("/").at(-1);
        if (failure && request.method === "GET" && table === failure.table) {
          return Response.json({
            code: failure.code, message: "read failed", details: null, hint: null,
          }, { status: 400 });
        }
        if (request.method === "DELETE") {
          state.categoryIds = [];
          return new Response(null, { status: 204 });
        }
        if (request.method === "POST") {
          const rows = await request.json() as { category_id: string }[];
          state.categoryIds = rows.map((row) => row.category_id);
          return new Response(null, { status: 201 });
        }
        if (table === "issues") {
          return Response.json({ id: ISSUE_ID, project_id: PROJECT_ID });
        }
        if (table === "categories") return Response.json([{ id: NEW_CATEGORY }]);
        return Response.json(state.categoryIds.map((category_id) => ({ category_id })));
      },
    },
  });
  return { requests, state };
}

const replace = (categoryIds: string[]) => setIssueCategories({
  issueId: ISSUE_ID,
  actorId: "member-1",
  categoryIds,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("category replacement read failures", () => {
  it.each([
    { code: "57014", requested: NEW_CATEGORY },
    { code: "22P02", requested: "undefined" },
  ])("preserves existing categories after a $code lookup error", async ({ code, requested }) => {
    const { requests, state } = database({ table: "categories", code });

    expect(await replace([requested])).toEqual({
      ok: false, status: 500, errorKey: "databaseError",
    });
    expect(state.categoryIds).toEqual([OLD_CATEGORY]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(insertEvents).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[set-issue-categories] category lookup failed:", "read failed",
    );
  });

  it("does not clear categories when the current snapshot cannot be read", async () => {
    const { requests, state } = database({ table: "issue_categories", code: "57014" });

    expect(await replace([])).toEqual({ ok: false, status: 500, errorKey: "databaseError" });
    expect(state.categoryIds).toEqual([OLD_CATEGORY]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(insertEvents).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[set-issue-categories] current categories lookup failed:", "read failed",
    );
  });

  it("reports an issue lookup failure as a database error", async () => {
    const { requests, state } = database({ table: "issues", code: "57014" });

    expect(await replace([NEW_CATEGORY])).toEqual({
      ok: false, status: 500, errorKey: "databaseError",
    });
    expect(state.categoryIds).toEqual([OLD_CATEGORY]);
    expect(requests).toHaveLength(1);
    expect(getProjectAccess).not.toHaveBeenCalled();
    expect(insertEvents).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[set-issue-categories] issue lookup failed:", "read failed",
    );
  });

  it("replaces the categories and records the successful diff", async () => {
    const { state } = database();

    expect(await replace([NEW_CATEGORY])).toEqual({ ok: true, categoryIds: [NEW_CATEGORY] });
    expect(state.categoryIds).toEqual([NEW_CATEGORY]);
    expect(insertEvents).toHaveBeenCalledWith(service, [
      { issue_id: ISSUE_ID, actor_id: "member-1", type: "category_added", to_value: NEW_CATEGORY },
      { issue_id: ISSUE_ID, actor_id: "member-1", type: "category_removed", from_value: OLD_CATEGORY },
    ]);
  });

  it("still accepts an intentional empty category set", async () => {
    const { state } = database();

    expect(await replace([])).toEqual({ ok: true, categoryIds: [] });
    expect(state.categoryIds).toEqual([]);
    expect(insertEvents).toHaveBeenCalledWith(service, [
      { issue_id: ISSUE_ID, actor_id: "member-1", type: "category_removed", from_value: OLD_CATEGORY },
    ]);
  });
});
