import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./execute-tool";
const h = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/server/project-access", () => ({ getProjectAccess: h.access }));
vi.mock("@/lib/server/page-tools", () => ({
  readPageForAgent: h.read,
  updateDatabaseForAgent: h.update,
  createPageForAgent: h.create,
}));
import { executeTool } from "./execute-tool";
import { PROJECT_ASSISTANT_TOOLS } from "./tools";
const ctx = {
  projectId: "project",
  userId: "actor",
  locale: "en",
} as ToolContext;
beforeEach(() => {
  vi.clearAllMocks();
  h.access.mockResolvedValue({ project: { id: "project" } });
  h.update.mockResolvedValue({
    ok: true,
    data: { page_id: "entry", property_values: { amount: -12.5 } },
  });
  h.read.mockResolvedValue({
    ok: true,
    data: {
      page_id: "database",
      database_schema: [],
      database_revision: 3,
      subpages: [],
    },
  });
  h.create.mockResolvedValue({ ok: true, data: { page_id: "new" } });
});
describe("Numo database tool dispatch", () => {
  it("exposes a project-scoped database tool and returns schema read results", async () => {
    const tool = PROJECT_ASSISTANT_TOOLS.find(
      (t) => t.function.name === "update_page_database",
    );
    expect(tool?.function.parameters.properties).toHaveProperty("project_id");
    expect(tool?.function.description).toContain("created_at is read-only");
    expect(
      await executeTool("get_page", { page_id: "database" }, ctx),
    ).toMatchObject({ success: true, result: { database_revision: 3 } });
  });
  it("forwards exact value preconditions and surfaces conflicts", async () => {
    const args = {
      page_id: "entry",
      operation: "value",
      propertyId: "amount",
      value: -12.5,
      expected: null,
    };
    expect(await executeTool("update_page_database", args, ctx)).toMatchObject({
      success: true,
    });
    expect(h.update).toHaveBeenCalledWith({
      projectId: "project",
      pageId: "entry",
      actorId: "actor",
      input: args,
    });
    h.update.mockResolvedValue({
      ok: false,
      code: "page_stale",
      message: "Read the current value and retry.",
    });
    expect(await executeTool("update_page_database", args, ctx)).toMatchObject({
      success: false,
      result: { error: "Read the current value and retry." },
    });
  });
  it("refuses inaccessible projects before dispatching a write", async () => {
    h.access.mockResolvedValue(null);
    expect(
      await executeTool(
        "update_page_database",
        { page_id: "entry", operation: "value" },
        ctx,
      ),
    ).toMatchObject({ success: false });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("creates databases and document entries through the existing page creator", async () => {
    await executeTool(
      "create_page",
      { title: "Journal", markdown: "", database: true },
      ctx,
    );
    expect(h.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        database: true,
        actorId: "actor",
        projectId: "project",
      }),
    );
    await executeTool(
      "create_page",
      { title: "Entry", markdown: "", parent_page_id: "database" },
      ctx,
    );
    expect(h.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ database: false, parentPageId: "database" }),
    );
  });
});
