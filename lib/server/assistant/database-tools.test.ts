import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./execute-tool";
const h = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  findPr: vi.fn(),
  resolveRepo: vi.fn(),
}));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequest: h.findPr,
  findPullRequestForIssue: vi.fn(),
  rowProvider: (row: { provider: string }) => row.provider,
}));
vi.mock("@/lib/server/agent/repo-access", () => ({
  resolveRepoCloneTarget: h.resolveRepo,
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess: h.access,
}));
vi.mock("@/lib/server/page-tools", () => ({
  readPageForAgent: h.read,
  updateDatabaseForAgent: h.update,
  createPageForAgent: h.create,
}));
import { executeTool } from "./execute-tool";
import { buildPageContextBlock } from "./prompt";
import { CONVERSATION_ASSISTANT_TOOLS, PROJECT_ASSISTANT_TOOLS } from "./tools";
const ctx = {
  projectId: "project",
  userId: "actor",
  locale: "en",
} as ToolContext;
beforeEach(() => {
  vi.clearAllMocks();
  h.access.mockResolvedValue({ project: { id: "project" }, isOwner: false, isMember: true, role: "member", canWrite: true, canComment: true });
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
  h.findPr.mockResolvedValue({
    id: "pr-1",
    provider: "github",
    repo_full_name: "mangue-dev/minddy",
    number: 42,
    title: "Unify Numo entry",
    url: "https://github.com/mangue-dev/minddy/pull/42",
    issue_id: "issue-1",
  });
  h.resolveRepo.mockResolvedValue({
    provider: "github",
    repoFullName: "mangue-dev/minddy",
  });
});

describe("Numo database tool dispatch", () => {
  it("provides canonical production citations for public documentation help", async () => {
    const result = await executeTool("get_help", { topic: "issues" }, { ...ctx, locale: "fr", documentationHelp: true });
    expect(result).toMatchObject({ success: true, result: {
      id: "issues", sourceUrl: "https://minddy.app/fr/documentation/issues",
    } });
  });
  it.each(["get_issue", "list_projects", "create_issue", "update_account_settings", "web_search", "call_mcp_tool"])("blocks %s on the public documentation surface before dispatch", async tool => {
    const result = await executeTool(tool, {}, { ...ctx, documentationHelp: true });
    expect(result.success).toBe(false);
    expect(result.result).toEqual({ error: "Only public documentation help is available in this conversation." });
    expect(h.access).not.toHaveBeenCalled();
  });
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
    await executeTool(
      "create_page",
      { title: "Alice", markdown: "", parent_page_id: "database", values: { email: "alice@example.com", age: 32 } },
      ctx,
    );
    expect(h.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ parentPageId: "database", values: { email: "alice@example.com", age: 32 } }),
    );
  });
});

describe("create_page_database (MIN-917)", () => {
  it("creates the database, its named columns and its rows in one call", async () => {
    h.create
      .mockResolvedValueOnce({ ok: true, data: { page_id: "db", database_revision: 0 } })
      .mockResolvedValue({ ok: true, data: { page_id: "row", title: "Acme" } });
    h.update.mockResolvedValueOnce({ ok: true, data: { page_id: "db", database_revision: 1 } });

    const result = await executeTool("create_page_database", {
      title: "Candidatures",
      icon: null,
      parent_page_id: null,
      title_column: "Entreprise",
      properties: [
        { name: "Statut", type: "select", options: ["Envoyée", "Entretien"] },
        { name: "Date", type: "date", options: null },
        { name: "Salaire", type: "number", options: null },
      ],
      rows: [
        { title: "Acme", values: { statut: "Entretien", Date: "2026-11-02", Salaire: "52000", Ville: "Lyon" } },
        { title: "Globex", values: { Statut: "Refusée" } },
      ],
    }, ctx);

    expect(h.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      database: true, title: "Candidatures", parentPageId: null,
    }));
    const input = h.update.mock.calls[0][0].input;
    expect(input).toMatchObject({ page_id: "db", operation: "schema", revision: 0, titleName: "Entreprise" });
    const [statut, date, salaire] = input.schema;
    expect(statut).toMatchObject({ name: "Statut", type: "select" });
    // An option a row uses joins the declared ones.
    expect(statut.options.map((o: { name: string }) => o.name)).toEqual(["Envoyée", "Entretien", "Refusée"]);
    expect(date).toMatchObject({ name: "Date", type: "date" });

    const interview = statut.options.find((o: { name: string }) => o.name === "Entretien").id;
    expect(h.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      parentPageId: "db",
      title: "Acme",
      values: { [statut.id]: interview, [date.id]: "2026-11-02", [salaire.id]: 52000 },
    }));
    expect(result).toMatchObject({ success: true, result: {
      page_id: "db",
      rows: [{ index: 0, page_id: "row", ignored_properties: ["Ville"] }, { index: 1 }],
      failed: [],
    } });
  });

  it("refuses a database without columns before creating anything", async () => {
    const result = await executeTool("create_page_database", {
      title: "Empty", icon: null, parent_page_id: null, title_column: null, properties: [], rows: null,
    }, ctx);
    expect(result).toMatchObject({ success: false });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("points to the created page when its columns are refused, so no duplicate is made", async () => {
    h.create.mockResolvedValueOnce({ ok: true, data: { page_id: "db", database_revision: 0 } });
    h.update.mockResolvedValueOnce({ ok: false, message: "The schema is invalid." });
    const result = await executeTool("create_page_database", {
      title: "Stock", icon: null, parent_page_id: null, title_column: null,
      properties: [{ name: "Qty", type: "number", options: null }], rows: null,
    }, ctx);
    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).toContain("update_page_database on that page");
  });
});

describe("an open empty database (MIN-738)", () => {
  it("steers a database request on the open page to that page, not a new one", () => {
    const block = buildPageContextBlock({ projectId: "project", pageId: "database" });
    expect(block).toContain("If is_database is true");
    expect(block).toContain("update_page_database and create no other page");
    const getPage = PROJECT_ASSISTANT_TOOLS.find((t) => t.function.name === "get_page");
    expect(getPage?.function.description).toContain("true even when database_schema is an empty array");
  });
});

describe("conversation action targets", () => {
  const conversation = { ...ctx, requireExplicitProjectTarget: true };
  it("keeps routine conversations able to ask for owner input without code tools", () => {
    const names = CONVERSATION_ASSISTANT_TOOLS.map((tool) => tool.function.name);
    expect(names).not.toContain("launch_code_agent");
    expect(names).not.toContain("report_automation_outcome");
    expect(names).toContain("ask_user");
  });
  it("never substitutes ambient context for an omitted action target", async () => {
    for (const name of ["update_page_database", "update_view"]) {
      expect(await executeTool(name, {}, conversation)).toMatchObject({ success: false });
    }
    expect(h.access).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
  it("keeps a named target stable when ambient context changes", async () => {
    const args = { project_id: "a", page_id: "entry", operation: "value", propertyId: "amount", value: 3 };
    await executeTool("update_page_database", args, { ...conversation, projectId: "b" });
    expect(h.access).toHaveBeenCalledWith("actor", "a");
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ projectId: "a" }));
  });
  it("refuses the retired automation outcome tool", async () => {
    expect(await executeTool("report_automation_outcome", { outcome: "ok", summary: "Done" }, conversation))
      .toMatchObject({ success: false });
  });
  it("rechecks access before the next message's action", async () => {
    const args = { project_id: "a", page_id: "entry", operation: "value" };
    await executeTool("update_page_database", args, conversation);
    h.access.mockResolvedValue(null);
    expect(await executeTool("update_page_database", args, conversation)).toMatchObject({ success: false });
    expect(h.access).toHaveBeenCalledTimes(2);
    expect(h.update).toHaveBeenCalledTimes(1);
  });
  it("keeps owner-only operations gated for an explicitly targeted member project", async () => {
    h.access.mockResolvedValue({ project: { id: "a" }, isOwner: false, isMember: true, role: "member", canWrite: true, canComment: true });
    expect(await executeTool("propose_backlog", { project_id: "a" }, conversation))
      .toMatchObject({ success: false, result: { error: "Only the project owner can seed the backlog of this project." } });
  });
});
