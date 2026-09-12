import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./execute-tool";
const h = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  launch: vi.fn(),
}));
vi.mock("@/lib/server/agent/launch", () => ({ launchAgentRun: h.launch }));
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


describe("conversation action targets", () => {
  const conversation = { ...ctx, requireExplicitProjectTarget: true };
  it("never substitutes ambient context for an omitted action or worker target", async () => {
    for (const name of ["update_page_database", "launch_code_agent", "update_view"]) {
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
  it("launches a worker for the authorized target even when ambient context is elsewhere", async () => {
    h.launch.mockResolvedValue({ ok: true, run: { id: "run", conversation_id: "worker", status: "queued", model: "test" } });
    expect(await executeTool("launch_code_agent", { project_id: "a", prompt: "Update the documentation" }, { ...conversation, projectId: "b" }))
      .toMatchObject({ success: true });
    expect(h.access).toHaveBeenCalledWith("actor", "a");
    expect(h.launch).toHaveBeenCalledWith(expect.objectContaining({ projectId: "a", userId: "actor" }));
  });
  it("owns a structured worker brief from the durable parent turn", async () => {
    h.access.mockResolvedValue({ project: { id: "a", key: "MIN" } });
    h.launch.mockResolvedValue({
      ok: true,
      run: {
        id: "run",
        conversation_id: "worker",
        status: "queued",
        model: "test",
        reasoning_level: "medium",
      },
    });
    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.eq = chain;
    query.maybeSingle = async () => ({
      data: {
        metadata: {
          attachments: [{
            storage_path: "actor/chat/file.txt",
            file_name: "file.txt",
            mime_type: "text/plain",
            size_bytes: 12,
          }],
        },
      },
    });
    const durable = {
      ...conversation,
      conversationId: "parent-conversation",
      turnId: "parent-turn",
      toolCallId: "call-1",
      service: { from: () => query },
    } as unknown as ToolContext;

    const result = await executeTool("launch_code_agent", {
      project_id: "a",
      mode: "custom",
      objective: "Inspect and update the repository documentation.",
      source_references: [{ kind: "conversation", label: "User request" }],
      constraints: ["Keep the public API stable."],
      authorized_work: ["read_repository", "modify_repository", "run_verification"],
    }, durable);

    expect(result).toMatchObject({
      success: true,
      result: { run_id: "run", parent_turn_id: "parent-turn", contract_version: 1 },
    });
    expect(h.launch).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "a",
      delegation: expect.objectContaining({
        parentConversationId: "parent-conversation",
        parentTurnId: "parent-turn",
        toolCallId: "call-1",
        objective: "Inspect and update the repository documentation.",
        attachments: [expect.objectContaining({ file_name: "file.txt" })],
        sourceReferences: expect.arrayContaining([
          expect.objectContaining({ kind: "attachment", label: "file.txt" }),
        ]),
      }),
    }));
  });
  it("explains how to replace a retired desktop-only worker provider", async () => {
    h.launch.mockResolvedValue({
      ok: false,
      error: "providerEndpointUnavailableFromSandbox",
    });
    expect(
      await executeTool(
        "launch_code_agent",
        { project_id: "a", prompt: "Update the documentation" },
        conversation,
      ),
    ).toMatchObject({
      success: false,
      result: {
        error: expect.stringMatching(/server sandbox.*cannot switch providers or billing accounts/i),
      },
    });
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
    h.access.mockResolvedValue({ project: { id: "a" }, isOwner: false });
    expect(await executeTool("propose_backlog", { project_id: "a" }, conversation))
      .toMatchObject({ success: false, result: { error: "Only the project owner can seed the backlog of this project." } });
  });
});
