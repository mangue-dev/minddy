import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";
import { ASSISTANT_TOOLS } from "./tools";

const { getProjectAccess, updateIssueFields, assertIssueInProject, addIssueRelation, findIssueRelation, removeIssueRelation,
  createPageForAgent, editPageTextForAgent } =
  vi.hoisted(() => ({
    createPageForAgent: vi.fn(),
    editPageTextForAgent: vi.fn(),
    getProjectAccess: vi.fn(),
    updateIssueFields: vi.fn(),
    assertIssueInProject: vi.fn(),
    addIssueRelation: vi.fn(),
    findIssueRelation: vi.fn(),
    removeIssueRelation: vi.fn(),
  }));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess,
}));
vi.mock("@/lib/server/update-issue", async (original) => ({
  ...await original<typeof import("@/lib/server/update-issue")>(), updateIssueFields,
}));
vi.mock("@/lib/server/issue-reads", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-reads")>(), assertIssueInProject,
}));
vi.mock("@/lib/server/page-tools", async (original) => ({
  ...await original<typeof import("@/lib/server/page-tools")>(), createPageForAgent, editPageTextForAgent,
}));
vi.mock("@/lib/server/issue-relations", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-relations")>(),
  addIssueRelation, findIssueRelation, removeIssueRelation,
}));

function context(): ToolContext {
  return {
    projectId: "project-1",
    userId: "user-1",
    supabase: {} as SupabaseClient,
    service: {} as SupabaseClient,
    locale: "en",
  };
}

const tool = (name: string) =>
  ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name)!;

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccess.mockResolvedValue({ project: { id: "project-1", key: "MIN" }, isOwner: true, isMember: true, role: "owner", canWrite: true, canComment: true });
  assertIssueInProject.mockImplementation(async (_db: unknown, id: string) =>
    id.startsWith("foreign") ? { ok: false, error: "Issue not found in this project." } : { ok: true });
  updateIssueFields.mockResolvedValue({ ok: true });
  addIssueRelation.mockResolvedValue({ ok: true });
  findIssueRelation.mockResolvedValue(null);
});

describe("Numo update_issues", () => {
  it("keeps the shared shape required and adds per-issue updates", () => {
    const parameters = tool("update_issues").function.parameters;
    expect(Object.keys(parameters.properties)).toEqual(["issue_ids", "fields", "updates"]);
    expect(parameters.required).toEqual(["issue_ids", "fields"]);
  });

  it("applies each issue's own fields and reports failures per issue", async () => {
    const result = await executeTool("update_issues", {
      issue_ids: ["a"],
      fields: { priority: "high" },
      updates: [
        { issue_id: "foreign-b", fields: { priority: "low" } },
        { issue_id: "a", fields: { effort: "s" } },
        { issue_id: "c", fields: {} },
      ],
    }, context());
    expect(result.success).toBe(false);
    expect(result.result).toEqual({
      updated: 1,
      failed: [
        { id: "foreign-b", error: "Issue not found in this project." },
        { id: "a", error: expect.stringMatching(/more than once/) },
        { id: "c", error: expect.stringMatching(/at least one field/) },
      ],
    });
    expect(updateIssueFields).toHaveBeenCalledTimes(1);
    expect(updateIssueFields).toHaveBeenCalledWith(expect.objectContaining({ issueId: "a", input: { priority: "high" }, viaAssistant: true }));
  });

  it("writes parent changes one at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    updateIssueFields.mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      return { ok: true };
    });
    await executeTool("update_issues", {
      issue_ids: ["a", "b"], fields: { priority: "low" },
      updates: [{ issue_id: "c", fields: { parent_id: "a" } }],
    }, context());
    expect(updateIssueFields).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });

  it("keeps the shared shape and deduplicates ids", async () => {
    const result = await executeTool("update_issues", { issue_ids: ["a", "b", "a"], fields: { status: "done" } }, context());
    expect(result).toEqual({ success: true, result: { updated: 2, failed: [] } });
  });

  it("refuses shared issues without fields", async () => {
    const result = await executeTool("update_issues", { issue_ids: ["a"], fields: {} }, context());
    expect(result.success).toBe(false);
    expect(updateIssueFields).not.toHaveBeenCalled();
  });
});

describe("Numo link_issues", () => {
  it("writes a batch of relations in order with per-link results", async () => {
    const result = await executeTool("link_issues", {
      issue_id: "a",
      relation: "blocks",
      target_issue_id: "b",
      links: [
        { issue_id: "b", relation: "blocks", target_issue_id: "b" },
        { issue_id: "b", relation: "nope", target_issue_id: "c" },
        { issue_id: "c", relation: "related", target_issue_id: "d", remove: true },
      ],
    }, context());
    expect(result.result).toEqual({
      results: [
        { index: 0, added: true, relation: "blocks" },
        { index: 3, removed: false, relation: "related" },
      ],
      failed: [
        { index: 1, error: "An entity cannot be related to itself." },
        { index: 2, error: expect.stringMatching(/relation must be one of/) },
      ],
    });
    expect(addIssueRelation).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, []])("keeps the single-relation shape when links is %j", async (links) => {
    const result = await executeTool("link_issues", { issue_id: "a", relation: "related", target_issue_id: "b", links }, context());
    expect(result).toEqual({ success: true, result: { added: true, relation: "related" } });
  });
});

describe("Numo batched page tools", () => {
  it("creates the top-level page and the extra ones under the same parent", async () => {
    createPageForAgent.mockImplementation(async ({ title }: { title: string }) =>
      title === "Bad" ? { ok: false, code: "invalid_params", message: "Refused." } : { ok: true, data: { page_id: `id-${title}`, title } });
    const result = await executeTool("create_page", {
      title: "One", markdown: "1", parent_page_id: "parent",
      pages: [{ title: "Bad", markdown: "x" }, { title: "Two", markdown: "2", values: { p: 1 } }],
    }, context());
    expect(result).toEqual({
      success: false,
      result: {
        pages: [{ index: 0, page_id: "id-One", title: "One" }, { index: 2, page_id: "id-Two", title: "Two" }],
        failed: [{ index: 1, error: "Refused." }],
      },
    });
    expect(createPageForAgent.mock.calls.map(([input]) => input.parentPageId)).toEqual(["parent", "parent", "parent"]);
    expect(createPageForAgent.mock.calls[2][0].values).toEqual({ p: 1 });
  });

  it("passes the first replacement and the extra edits as one ordered list", async () => {
    editPageTextForAgent.mockResolvedValue({ ok: true, data: { page_id: "p" } });
    await executeTool("edit_page_text", {
      page_id: "p", old_string: "a", new_string: "b",
      edits: [{ old_string: "c", new_string: "d", replace_all: true }],
    }, context());
    expect(editPageTextForAgent).toHaveBeenCalledWith(expect.objectContaining({
      edits: [
        { oldString: "a", newString: "b", replaceAll: false },
        { oldString: "c", newString: "d", replaceAll: true },
      ],
    }));
  });
});
