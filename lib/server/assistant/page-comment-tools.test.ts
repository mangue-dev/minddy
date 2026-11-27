import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";
import { ASSISTANT_TOOLS } from "./tools";

/**
 * MIN-1031 — Numo answers and resolves a page's comment threads through the
 * same core as the MCP (`lib/server/page-tools.ts`). The core itself runs
 * against a fake database in `lib/server/mcp/page-tools.test.ts`; here it is
 * mocked, to pin what Numo's surface adds: the Numo signature, the defaults,
 * and the project capability gate.
 */

const { getProjectAccess, addPageCommentForAgent, resolvePageThreadForAgent } = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  addPageCommentForAgent: vi.fn(),
  resolvePageThreadForAgent: vi.fn(),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess,
}));
vi.mock("@/lib/server/page-tools", async (original) => ({
  ...await original<typeof import("@/lib/server/page-tools")>(),
  addPageCommentForAgent,
  resolvePageThreadForAgent,
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

const access = (canComment: boolean) => ({
  project: { id: "project-1", key: "MIN" },
  isOwner: false,
  isMember: true,
  role: "reader",
  canWrite: false,
  canComment,
});

const tool = (name: string) =>
  ASSISTANT_TOOLS.find((candidate) => candidate.function.name === name)!;

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccess.mockResolvedValue(access(true));
  addPageCommentForAgent.mockResolvedValue({
    ok: true,
    data: { page_id: "page-1", comment_id: "comment-2" },
  });
  resolvePageThreadForAgent.mockResolvedValue({
    ok: true,
    data: { page_id: "page-1", thread_id: "thread-1", resolved: true },
  });
});

describe("Numo page comment tools", () => {
  it("requires the page and the body, or the page and the thread", () => {
    expect(tool("add_page_comment").function.parameters.required).toEqual(["page_id", "body"]);
    expect(tool("resolve_page_thread").function.parameters.required).toEqual(["page_id", "thread_id"]);
  });

  it("replies inside a thread, signed Numo", async () => {
    const result = await executeTool("add_page_comment", {
      project_id: "project-1",
      page_id: "page-1",
      body: "Done: the quota is now monthly in the text.",
      parent_comment_id: "thread-1",
    }, context());

    expect(result).toEqual({ result: { page_id: "page-1", comment_id: "comment-2" }, success: true });
    expect(addPageCommentForAgent).toHaveBeenCalledWith({
      pageId: "page-1",
      projectId: "project-1",
      actorId: "user-1",
      body: "Done: the quota is now monthly in the text.",
      blockId: null,
      parentCommentId: "thread-1",
      viaAssistant: true,
    });
  });

  it("resolves by default and reopens with resolved: false", async () => {
    await executeTool("resolve_page_thread", {
      project_id: "project-1", page_id: "page-1", thread_id: "thread-1",
    }, context());
    await executeTool("resolve_page_thread", {
      project_id: "project-1", page_id: "page-1", thread_id: "thread-1", resolved: false,
    }, context());

    expect(resolvePageThreadForAgent.mock.calls.map(([call]) => call.resolved)).toEqual([true, false]);
    expect(resolvePageThreadForAgent).toHaveBeenCalledWith(expect.objectContaining({
      pageId: "page-1", projectId: "project-1", actorId: "user-1", threadId: "thread-1",
    }));
  });

  it("asks for the thread instead of guessing one", async () => {
    const result = await executeTool("resolve_page_thread", {
      project_id: "project-1", page_id: "page-1",
    }, context());
    expect(result.success).toBe(false);
    expect(resolvePageThreadForAgent).not.toHaveBeenCalled();
  });

  it("refuses both gestures to a reader who cannot comment", async () => {
    getProjectAccess.mockResolvedValue(access(false));
    for (const [name, args] of [
      ["add_page_comment", { body: "a reply", parent_comment_id: "thread-1" }],
      ["resolve_page_thread", { thread_id: "thread-1" }],
    ] as const) {
      const result = await executeTool(name, { project_id: "project-1", page_id: "page-1", ...args }, context());
      expect(result.success, name).toBe(false);
    }
    expect(addPageCommentForAgent).not.toHaveBeenCalled();
    expect(resolvePageThreadForAgent).not.toHaveBeenCalled();
  });

  it("relays the core's refusal", async () => {
    addPageCommentForAgent.mockResolvedValue({
      ok: false,
      code: "invalid_params",
      message: "That comment is not on this page — pass a thread_id from the threads the page read returned.",
    });
    const result = await executeTool("add_page_comment", {
      project_id: "project-1", page_id: "page-1", body: "a reply", parent_comment_id: "elsewhere",
    }, context());
    expect(result.success).toBe(false);
  });
});
