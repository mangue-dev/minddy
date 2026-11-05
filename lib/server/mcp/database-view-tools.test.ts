import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { SavedDatabaseView } from "@/lib/page-databases";
import type { ProjectAccess } from "@/lib/server/project-access";
import type { ToolExtra, ToolResult } from "./tool-helpers";

/**
 * MIN-898: the saved views of a page database on the MCP. The handlers run
 * through the real `registerMinddyTools` wrappers (capability enforcement),
 * the real `requireProject` and the shared `database-view-tools.ts`; only the
 * access lookup, the page read and the view repository are faked.
 */

const PROJECT = "11111111-1111-4111-8111-111111111111";
const DB = "0b0c3d1e-1111-4aaa-8bbb-000000000001";
const STATUS = "0b0c3d1e-2222-4aaa-8bbb-000000000002";
const CREATED = "0b0c3d1e-3333-4aaa-8bbb-000000000003";
const V1 = "0b0c3d1e-5555-4aaa-8bbb-000000000005";
const V2 = "0b0c3d1e-6666-4aaa-8bbb-000000000006";
const NEW = "0b0c3d1e-7777-4aaa-8bbb-000000000007";
const OPEN = "0b0c3d1e-8888-4aaa-8bbb-000000000008";
const CANCELED = "0b0c3d1e-9999-4aaa-8bbb-000000000009";
const UNKNOWN = "0b0c3d1e-aaaa-4aaa-8bbb-00000000000a";

const h = vi.hoisted(() => ({
  access: vi.fn(),
  getPage: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/project-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/project-access")>()),
  getProjectAccess: h.access,
}));
vi.mock("@/lib/server/pages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/pages")>()),
  getPage: h.getPage,
}));
vi.mock("@/lib/server/page-database-views", () => ({
  listPageDatabaseViews: h.list,
  createPageDatabaseView: h.create,
  updatePageDatabaseView: h.update,
  deletePageDatabaseView: h.remove,
}));

const { registerMinddyTools } = await import("./tools");
const { mcpToolCatalog } = await import("./catalog");

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

let user = 0;
async function call(name: string, args: Record<string, unknown>) {
  // A distinct user per call keeps the per-user rate limit out of the way.
  user += 1;
  const extra = { http: { authInfo: { extra: { userId: `user-${user}` } } } } as unknown as ToolExtra;
  const result = await handlers.get(name)!({ project_id: PROJECT, page_id: DB, ...args }, extra);
  return { result, body: JSON.parse(result.content[0].text) };
}
const write = (args: Record<string, unknown>) => call("minddy_update_page_database_views", args);

function accessFor(role: ProjectAccess["role"]): ProjectAccess {
  return {
    project: { id: PROJECT, key: "MIN", name: "minddy", owner_id: "owner" },
    isOwner: role === "owner",
    isMember: true,
    role,
    canWrite: role !== "reader",
    canComment: true,
  } as ProjectAccess;
}

const view = (id: string, name: string, position: number,
  overrides: Partial<SavedDatabaseView["view"]> = {}): SavedDatabaseView => ({
  id, name, position,
  view: { sort: "position", descending: false, filters: { match: "and", conditions: [] },
    filter: "", filterValue: "", hidden: [], ...overrides },
});
let stored: SavedDatabaseView[];

beforeEach(() => {
  vi.clearAllMocks();
  h.access.mockResolvedValue(accessFor("member"));
  h.getPage.mockResolvedValue({ ok: true, page: { id: DB, project_id: PROJECT, database_schema: [
    { id: STATUS, name: "Status", type: "select", options: [
      { id: OPEN, name: "Open", color: "#00aa00" },
      { id: CANCELED, name: "Canceled", color: "#aa0000" },
    ] },
    { id: CREATED, name: "Created", type: "created_at" },
  ] } });
  stored = [view(V1, "All", 1), view(V2, "Open", 2)];
  h.list.mockImplementation(async () => ({ ok: true, page: stored }));
  h.create.mockImplementation(async (_p, _d, _a, input: { name: string; view: SavedDatabaseView["view"] }) => {
    const created = { id: NEW, name: input.name, position: 3, view: input.view };
    stored = [...stored, created];
    return { ok: true, page: created };
  });
  h.update.mockImplementation(async (_p, _d, id: string, _a, input: Partial<SavedDatabaseView>) => {
    stored = stored.map((saved) => saved.id === id ? { ...saved, ...input } : saved)
      .sort((a, b) => a.position - b.position);
    return { ok: true, page: stored.find((saved) => saved.id === id) };
  });
  h.remove.mockResolvedValue({ ok: true, page: null });
});

describe("MCP page database views (MIN-898)", () => {
  it("advertises a read tool and a destructive write tool that name each other", () => {
    const catalog = mcpToolCatalog();
    const list = catalog.find((tool) => tool.name === "minddy_list_page_database_views");
    const update = catalog.find((tool) => tool.name === "minddy_update_page_database_views");
    expect(list?.readOnly).toBe(true);
    expect(update?.readOnly).toBe(false);
    expect(list?.description).toContain("minddy_update_page_database_views");
    expect(update?.description).toContain("minddy_list_page_database_views");
    expect(update?.description).toContain("minddy_get_page");
    // The MCP has no issue board view tools to point at.
    expect(update?.description).not.toMatch(/\bcreate_view\b/);
    expect(update?.params.filter((param) => param.required).map((param) => param.name).sort())
      .toEqual(["operation", "page_id", "project_id"]);
    for (const name of ["minddy_get_page", "minddy_update_page_database"]) {
      expect(catalog.find((tool) => tool.name === name)?.description)
        .toMatch(/minddy_(list|update)_page_database_views/);
    }
  });

  it("lists the views in strip order", async () => {
    const { result, body } = await call("minddy_list_page_database_views", {});
    expect(result.isError).not.toBe(true);
    expect(body).toMatchObject({ page_id: DB, views: [
      { view_id: V1, name: "All", position: 1 },
      { view_id: V2, name: "Open", position: 2 },
    ] });
    expect(h.list).toHaveBeenCalledWith(PROJECT, DB, expect.any(String));
  });

  it("creates a view with a select filter and a descending creation-date sort", async () => {
    const { result, body } = await write({ operation: "create", name: "Not canceled",
      sort: CREATED, descending: true,
      filters: { conditions: [{ property_id: STATUS, operator: "neq", value: CANCELED }] } });
    expect(result.isError).not.toBe(true);
    expect(h.create).toHaveBeenCalledWith(PROJECT, DB, expect.any(String), {
      name: "Not canceled",
      view: expect.objectContaining({ sort: CREATED, descending: true, hidden: [],
        filters: { match: "and", conditions: [
          { id: expect.any(String), propertyId: STATUS, operator: "neq", value: CANCELED },
        ] } }),
    });
    expect(body.view).toMatchObject({ view_id: NEW, name: "Not canceled",
      filters: { conditions: [{ property_id: STATUS, operator: "neq", value: CANCELED }] } });
    expect(body.views).toHaveLength(3);
  });

  it("updates only the fields passed", async () => {
    stored = [view(V1, "All", 1), view(V2, "Open", 2, { sort: CREATED, descending: true })];
    await write({ operation: "update", view_id: V2, name: "Still open" });
    expect(h.update).toHaveBeenCalledWith(PROJECT, DB, V2, expect.any(String), {
      name: "Still open",
      view: expect.objectContaining({ sort: CREATED, descending: true }),
    });
  });

  it("reorders the whole strip", async () => {
    const { body } = await write({ operation: "reorder", order: [V2, V1] });
    expect(body.views.map((saved: { view_id: string }) => saved.view_id)).toEqual([V2, V1]);
  });

  it("refuses an option id the property does not have, naming the MCP tools", async () => {
    const { result, body } = await write({ operation: "create", name: "Broken",
      filters: { conditions: [{ property_id: STATUS, operator: "eq", value: UNKNOWN }] } });
    expect(result.isError).toBe(true);
    expect(body.error.code).toBe("invalid_params");
    expect(body.error.message).toContain("option id");
    expect(h.create).not.toHaveBeenCalled();

    const missing = await write({ operation: "update", view_id: UNKNOWN, name: "Gone" });
    expect(missing.body.error.message).toContain("minddy_list_page_database_views");
  });

  it("points a page that is not a database to minddy_get_page", async () => {
    h.getPage.mockResolvedValue({ ok: true, page: { id: DB, project_id: PROJECT, database_schema: null } });
    const { body } = await call("minddy_list_page_database_views", {});
    expect(body.error.code).toBe("page_not_found");
    expect(body.error.message).toContain("minddy_get_page");
  });

  it("lets a reader list the views but not change them", async () => {
    h.access.mockResolvedValue(accessFor("reader"));
    expect((await call("minddy_list_page_database_views", {})).result.isError).not.toBe(true);
    const { body } = await write({ operation: "create", name: "Mine" });
    expect(body.error.code).toBe("forbidden");
    expect(h.create).not.toHaveBeenCalled();
  });
});
