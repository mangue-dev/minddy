import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedDatabaseView } from "@/lib/page-databases";
import type { ToolContext } from "./execute-tool";

const DB = "0b0c3d1e-1111-4aaa-8bbb-000000000001";
const STATUS = "0b0c3d1e-2222-4aaa-8bbb-000000000002";
const DONE = "0b0c3d1e-3333-4aaa-8bbb-000000000003";
const DUE = "0b0c3d1e-4444-4aaa-8bbb-000000000004";
const V1 = "0b0c3d1e-5555-4aaa-8bbb-000000000005";
const V2 = "0b0c3d1e-6666-4aaa-8bbb-000000000006";
const OTHER = "0b0c3d1e-7777-4aaa-8bbb-000000000007";
const OPEN = "0b0c3d1e-8888-4aaa-8bbb-000000000008";
const AMOUNT = "0b0c3d1e-9999-4aaa-8bbb-000000000009";
const HOURS = "0b0c3d1e-aaaa-4aaa-8bbb-00000000000a";
const NO_FILTER = { match: "and", conditions: [] };

const h = vi.hoisted(() => ({
  access: vi.fn(),
  getPage: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess: h.access,
}));
vi.mock("@/lib/server/pages", async (original) => ({
  ...await original<typeof import("@/lib/server/pages")>(), getPage: h.getPage,
}));
vi.mock("@/lib/server/page-database-views", () => ({
  listPageDatabaseViews: h.list,
  createPageDatabaseView: h.create,
  updatePageDatabaseView: h.update,
  deletePageDatabaseView: h.remove,
}));
import { executeTool } from "./execute-tool";
import { CONVERSATION_ASSISTANT_TOOLS } from "./tools";

const ctx = { projectId: "project", userId: "actor", locale: "en" } as ToolContext;
const view = (id: string, name: string, position: number,
  overrides: Partial<SavedDatabaseView["view"]> = {}): SavedDatabaseView => ({
  id, name, position,
  view: { sort: "position", descending: false, filters: { match: "and", conditions: [] },
    filter: "", filterValue: "", hidden: [], calculations: {}, widths: {}, ...overrides },
});
let stored: SavedDatabaseView[];

beforeEach(() => {
  vi.clearAllMocks();
  h.access.mockResolvedValue({ project: { id: "project" }, isOwner: false, isMember: true,
    role: "member", canWrite: true, canComment: true });
  h.getPage.mockResolvedValue({ ok: true, page: { id: DB, project_id: "project", database_schema: [
    { id: STATUS, name: "Status", type: "select", options: [{ id: OPEN, name: "Open", color: "#00aa00" }] },
    { id: DONE, name: "Done", type: "checkbox" },
    { id: DUE, name: "Due", type: "date" },
    { id: AMOUNT, name: "Amount", type: "number" },
    { id: HOURS, name: "Hours", type: "number" },
  ] } });
  stored = [view(V1, "All", 1), view(V2, "Open", 2, { filter: STATUS, filterValue: "Open", hidden: [DUE] })];
  h.list.mockImplementation(async () => ({ ok: true, page: stored }));
  h.create.mockImplementation(async (_p, _d, _a, input: { name: string; view: SavedDatabaseView["view"] }) => {
    const created = { id: OTHER, name: input.name, position: 3, view: input.view };
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

const write = (args: Record<string, unknown>, context: ToolContext = ctx) =>
  executeTool("update_page_database_views", { project_id: "project", page_id: DB, ...args }, context);

describe("Numo database view tools", () => {
  it("advertises a read tool and a write tool on the database page", () => {
    const names = CONVERSATION_ASSISTANT_TOOLS.map((tool) => tool.function.name);
    expect(names).toEqual(expect.arrayContaining(["list_page_database_views", "update_page_database_views"]));
    const writeTool = CONVERSATION_ASSISTANT_TOOLS.find((tool) => tool.function.name === "update_page_database_views");
    expect(writeTool?.function.parameters.required).toEqual(["project_id", "page_id", "operation"]);
  });

  it("lists the views flat, in strip order, with a former single filter as a condition", async () => {
    const result = await executeTool("list_page_database_views", { project_id: "project", page_id: DB }, ctx);
    expect(result).toMatchObject({ success: true, result: { page_id: DB, views: [
      { view_id: V1, name: "All", filters: NO_FILTER },
      { view_id: V2, filters: { match: "and", conditions: [
        { property_id: STATUS, operator: "eq", value: OPEN }] }, hidden_property_ids: [DUE] },
    ] } });
    expect(h.list).toHaveBeenCalledWith("project", DB, "actor");
  });

  it("says when a database still shows its default view", async () => {
    stored = [];
    const result = await executeTool("list_page_database_views", { project_id: "project", page_id: DB }, ctx);
    expect(result).toMatchObject({ success: true, result: { views: [], note: expect.stringContaining("default view") } });
  });

  it("creates a view from the defaults and the fields given", async () => {
    const result = await write({ operation: "create", name: "Late", sort: DUE, descending: true,
      filters: { match: "or", conditions: [
        { property_id: DONE, operator: "eq", value: "false" },
        { property_id: DUE, operator: "lt", value: "2026-10-01" },
      ] } });
    expect(h.create).toHaveBeenCalledWith("project", DB, "actor", { name: "Late", view: {
      sort: DUE, descending: true, hidden: [], calculations: {}, widths: {},
      filters: { match: "or", conditions: [
        { id: expect.any(String), propertyId: DONE, operator: "eq", value: "false" },
        { id: expect.any(String), propertyId: DUE, operator: "lt", value: "2026-10-01" },
      ] },
      // Two OR conditions cannot be one single filter: the previous release shows everything.
      filter: "", filterValue: "" } });
    expect(result).toMatchObject({ success: true, result: { view: { view_id: OTHER, name: "Late",
      filters: { match: "or", conditions: [{ property_id: DONE }, { property_id: DUE }] } } } });
    expect((result.result as { views: unknown[] }).views).toHaveLength(3);
  });

  it("updates only the fields passed, and writes the single-filter mirror", async () => {
    await write({ operation: "update", view_id: V2, name: "Undated", filters: {
      conditions: [{ property_id: DUE, operator: "empty", value: "ignored" }] } });
    expect(h.update).toHaveBeenCalledWith("project", DB, V2, "actor", { name: "Undated", view: {
      sort: "position", descending: false, hidden: [DUE], calculations: {}, widths: {},
      filters: { match: "and", conditions: [{ id: expect.any(String), propertyId: DUE, operator: "empty" }] },
      filter: DUE, filterValue: "" } });
    await write({ operation: "update", view_id: V2, filters: null });
    expect(h.update).toHaveBeenLastCalledWith("project", DB, V2, "actor", { view: expect.objectContaining({
      filters: NO_FILTER, filter: "", filterValue: "" }) });
  });

  it("keeps a former single filter, converted, when another field changes", async () => {
    await write({ operation: "update", view_id: V2, descending: true });
    expect(h.update).toHaveBeenCalledWith("project", DB, V2, "actor", { view: expect.objectContaining({
      descending: true, filter: STATUS, filterValue: "Open",
      filters: { match: "and", conditions: [expect.objectContaining({ propertyId: STATUS, operator: "eq", value: OPEN })] },
    }) });
  });

  it.each([
    [{ operation: "update", view_id: V1, sort: OTHER }, "sort must be"],
    [{ operation: "update", view_id: V1, hidden_property_ids: [OTHER] }, "hidden_property_ids must be"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: OTHER, operator: "empty" }] } },
      "filters.conditions[0].property_id must be"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: DONE, operator: "empty" }] } },
      "does not apply to the checkbox property \"Done\"; use one of: eq"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: DONE, operator: "eq", value: "yes" }] } },
      "\"true\" (checked)"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: DUE, operator: "gt", value: "tomorrow" }] } },
      "YYYY-MM-DD"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: STATUS, operator: "eq", value: "Open" }] } },
      "an option id of this property"],
    [{ operation: "update", view_id: V1, filters: { conditions: [{ property_id: DUE, operator: "eq" }] } },
      "filters.conditions[0].value must be"],
    [{ operation: "update", view_id: V1, filters: { match: "xor", conditions: [] } }, "Invalid arguments"],
    [{ operation: "update", view_id: OTHER, name: "Ghost" }, "view_id must be"],
    [{ operation: "create" }, "needs a name"],
    [{ operation: "reorder", order: [V1] }, "order must list every view_id"],
    [{ operation: "reorder", order: [V1, V1] }, "order must list every view_id"],
  ])("refuses %o before writing", async (args, message) => {
    const result = await write(args);
    expect(result.success).toBe(false);
    expect((result.result as { error: string }).error).toContain(message);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it("keeps the last view of a database", async () => {
    stored = [view(V1, "All", 1)];
    expect(await write({ operation: "delete", view_id: V1 })).toMatchObject({ success: false });
    expect(h.remove).not.toHaveBeenCalled();
    stored = [view(V1, "All", 1), view(V2, "Open", 2)];
    expect(await write({ operation: "delete", view_id: V2 })).toMatchObject({ success: true });
    expect(h.remove).toHaveBeenCalledWith("project", DB, V2, "actor");
  });

  it("reorders the strip by rewriting the positions that moved", async () => {
    const result = await write({ operation: "reorder", order: [V2, V1] });
    expect(h.update).toHaveBeenNthCalledWith(1, "project", DB, V2, "actor", { position: 1 });
    expect(h.update).toHaveBeenNthCalledWith(2, "project", DB, V1, "actor", { position: 2 });
    expect(result).toMatchObject({ success: true, result: { views: [{ view_id: V2 }, { view_id: V1 }] } });
  });

  it("refuses a page that is not a database of the project", async () => {
    h.getPage.mockResolvedValue({ ok: true, page: { id: DB, project_id: "project", database_schema: null } });
    const result = await write({ operation: "create", name: "Board" });
    expect(result).toMatchObject({ success: false });
    expect((result.result as { error: string }).error).toContain("is_database");
    expect(h.list).not.toHaveBeenCalled();
  });

  it("surfaces a concurrent edit as stale", async () => {
    h.update.mockResolvedValue({ ok: false, status: 409, errorKey: "pageDatabaseStale" });
    const result = await write({ operation: "update", view_id: V1, descending: true });
    expect((result.result as { error: string }).error).toContain("changed this view");
  });

  it("refuses a reader before the view repository runs, but lets them list", async () => {
    h.access.mockResolvedValue({ project: { id: "project" }, isOwner: false, isMember: true,
      role: "reader", canWrite: false, canComment: false });
    expect(await write({ operation: "update", view_id: V1, descending: true }))
      .toMatchObject({ success: false });
    expect(h.getPage).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(await executeTool("list_page_database_views", { project_id: "project", page_id: DB }, ctx))
      .toMatchObject({ success: true });
  });
});

describe("Numo column calculations (MIN-1012)", () => {
  it("routes a sum or an average under a column to the view tool", () => {
    const writeTool = CONVERSATION_ASSISTANT_TOOLS.find((tool) => tool.function.name === "update_page_database_views");
    expect(writeTool?.function.description).toMatch(/calculation under a number column/);
    const getPage = CONVERSATION_ASSISTANT_TOOLS.find((tool) => tool.function.name === "get_page");
    expect(getPage?.function.description).toMatch(/calculation under each number column/);
  });

  it("sets, replaces and clears the calculations of a view", async () => {
    await write({ operation: "update", view_id: V1, calculations: { [AMOUNT]: "sum" } });
    expect(stored[0].view.calculations).toEqual({ [AMOUNT]: "sum" });
    const result = await write({ operation: "update", view_id: V1,
      calculations: { [AMOUNT]: "average", [HOURS]: "max" } });
    expect(result).toMatchObject({ success: true, result: { view: { view_id: V1,
      calculations: { [AMOUNT]: "average", [HOURS]: "max" } } } });
    // Other fields of the view stay as they were.
    expect(stored[0].view).toMatchObject({ sort: "position", hidden: [] });
    await write({ operation: "update", view_id: V1, calculations: {} });
    expect(stored[0].view.calculations).toEqual({});
  });

  it("refuses a calculation on a column that is not a number", async () => {
    const result = await write({ operation: "update", view_id: V1, calculations: { [DUE]: "sum" } });
    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).toContain(DUE);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("refuses a calculation kind the table does not know", async () => {
    expect(await write({ operation: "update", view_id: V1, calculations: { [AMOUNT]: "median" } }))
      .toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("changes the view shown first when no view_id is given", async () => {
    await write({ operation: "update", calculations: { [AMOUNT]: "count" } });
    expect(h.update).toHaveBeenCalledWith("project", DB, V1, "actor",
      { view: expect.objectContaining({ calculations: { [AMOUNT]: "count" } }) });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("saves the default view, named in the user's language, on a database without one", async () => {
    stored = [];
    const result = await write({ operation: "update", calculations: { [AMOUNT]: "sum" } },
      { ...ctx, locale: "fr" } as ToolContext);
    expect(h.create).toHaveBeenCalledWith("project", DB, "actor", { name: "Tableau",
      view: expect.objectContaining({ sort: "position", hidden: [], calculations: { [AMOUNT]: "sum" } }) });
    expect(result).toMatchObject({ success: true, result: { views: [{ name: "Tableau" }] } });
  });

  it("still refuses a view_id the database does not have", async () => {
    expect(await write({ operation: "update", view_id: OTHER, calculations: { [AMOUNT]: "sum" } }))
      .toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});
