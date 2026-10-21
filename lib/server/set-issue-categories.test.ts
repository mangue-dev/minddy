import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setIssueCategories } from "./set-issue-categories";

const { insertEvents, getProjectAccess, releaseSmartFillFields } = vi.hoisted(() => ({
  insertEvents: vi.fn(),
  releaseSmartFillFields: vi.fn(async () => {}),
  getProjectAccess: vi.fn(async () => ({ role: "member", canWrite: true, canComment: true })),
}));
let service: SupabaseClient;
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess }));
vi.mock("@/lib/server/smart-fill-ownership", () => ({ releaseSmartFillFields }));
vi.mock("@/lib/server/issue-events", async (importOriginal) => ({
  ...await importOriginal<typeof import("./issue-events")>(),
  insertEvents,
}));

const ISSUE_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT_ID = "00000000-0000-4000-8000-000000000002";
const OLD_CATEGORY = "00000000-0000-4000-8000-000000000003";
const NEW_CATEGORY = "00000000-0000-4000-8000-000000000004";

type Rpc = { status: number; body: unknown };

/**
 * Fake PostgREST: plain reads for the issue lookup, and an in-memory
 * `replace_issue_categories` that, like the SQL function, commits all or
 * nothing. `rpc` overrides its response to simulate a failed transaction.
 */
function database(options: { failure?: { table: string; code: string }; rpc?: Rpc } = {}) {
  const requests: Request[] = [];
  const state = { categoryIds: [OLD_CATEGORY] };
  service = createClient("https://fixture.supabase.co", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        const table = new URL(request.url).pathname.split("/").at(-1);
        const { failure } = options;
        if (failure && request.method === "GET" && table === failure.table) {
          return Response.json({
            code: failure.code, message: "read failed", details: null, hint: null,
          }, { status: 400 });
        }
        if (table === "replace_issue_categories") {
          if (options.rpc) return Response.json(options.rpc.body, { status: options.rpc.status });
          const { p_category_ids: wanted } = await request.json() as { p_category_ids: string[] };
          const valid = [...new Set(wanted)].filter((id) => id === (NEW_CATEGORY as string));
          const added = valid.filter((id) => !state.categoryIds.includes(id));
          const removed = state.categoryIds.filter((id) => !valid.includes(id));
          state.categoryIds = valid;
          return Response.json({ category_ids: valid, added, removed });
        }
        if (table === "issues") {
          return Response.json({ id: ISSUE_ID, project_id: PROJECT_ID });
        }
        return Response.json({ message: `unexpected ${request.method} ${table}` }, { status: 500 });
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

describe("atomic category replacement", () => {
  it("never writes the join table outside the replacement function", async () => {
    const { requests } = database();

    await replace([NEW_CATEGORY]);
    const tables = requests.map((request) => new URL(request.url).pathname.split("/").at(-1));
    expect(tables).toEqual(["issues", "replace_issue_categories"]);
    expect(requests.at(-1)?.method).toBe("POST");
  });

  it("keeps the previous categories and logs nothing when the replacement fails", async () => {
    const { state } = database({ rpc: { status: 409, body: {
      code: "23503", message: "category deleted concurrently", details: null, hint: null,
    } } });

    expect(await replace([NEW_CATEGORY])).toEqual({
      ok: false, status: 500, errorKey: "databaseError",
    });
    expect(state.categoryIds).toEqual([OLD_CATEGORY]);
    expect(insertEvents).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[set-issue-categories] replace failed:", "category deleted concurrently",
    );
  });

  it("maps the function's actor guard to a read-only refusal", async () => {
    database({ rpc: { status: 403, body: {
      code: "42501", message: "tenant_guard_forbidden", details: null, hint: null,
    } } });

    expect(await replace([NEW_CATEGORY])).toEqual({
      ok: false, status: 403, errorKey: "readOnlyProject",
    });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("reports an issue deleted before the lock as not found", async () => {
    database({ rpc: { status: 200, body: { code: "not_found" } } });

    expect(await replace([NEW_CATEGORY])).toEqual({
      ok: false, status: 404, errorKey: "issueNotFound",
    });
    expect(insertEvents).not.toHaveBeenCalled();
  });

  it("records the committed difference, not the requested list", async () => {
    const { state } = database();

    expect(await replace([NEW_CATEGORY, NEW_CATEGORY, "00000000-0000-4000-8000-000000000009"]))
      .toEqual({ ok: true, categoryIds: [NEW_CATEGORY] });
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

  it("takes the categories back from Smart Fill after a change by hand", async () => {
    database();

    await replace([NEW_CATEGORY]);

    expect(releaseSmartFillFields).toHaveBeenCalledWith(service, ISSUE_ID, ["category_ids"]);
  });

  it("keeps ownership when nothing changed", async () => {
    database();

    await replace([]);
    vi.clearAllMocks();
    // The set is already empty: the replacement commits no difference.
    await replace([]);

    expect(releaseSmartFillFields).not.toHaveBeenCalled();
  });

  it("stamps a Smart Fill re-evaluation and keeps its ownership", async () => {
    database();

    await setIssueCategories({
      issueId: ISSUE_ID,
      actorId: "member-1",
      categoryIds: [NEW_CATEGORY],
      viaSmartFill: true,
    });

    expect(releaseSmartFillFields).not.toHaveBeenCalled();
    expect(insertEvents).toHaveBeenCalledWith(service, [
      expect.objectContaining({ type: "category_added", to_value: NEW_CATEGORY, via_smart_fill: true }),
      expect.objectContaining({ type: "category_removed", from_value: OLD_CATEGORY, via_smart_fill: true }),
    ]);
  });

  it("reports an issue lookup failure as a database error", async () => {
    const { requests, state } = database({ failure: { table: "issues", code: "57014" } });

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
});

describe("replace_issue_categories migration", () => {
  const sql = readFileSync(join(process.cwd(),
    "supabase/migrations/20270109200072_atomic_issue_category_replacement.sql"), "utf8");

  it("serializes replacements on the issue row and checks the actor", () => {
    expect(sql).toMatch(/WHERE i\.id = p_issue_id AND i\.deleted_at IS NULL\s+FOR NO KEY UPDATE;/);
    expect(sql).toContain("m.role = 'member'");
    expect(sql).toContain("ERRCODE = '42501'");
  });

  it("is callable by the service role only", () => {
    expect(sql).toContain("SECURITY DEFINER SET search_path = ''");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.replace_issue_categories\(uuid, uuid, uuid\[\]\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(sql).toContain("TO service_role;");
  });
});
