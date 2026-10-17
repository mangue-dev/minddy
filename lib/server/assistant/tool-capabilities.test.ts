import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectAccess } from "@/lib/server/project-access";

/**
 * MIN-693: Numo's single capability gate. Every tool is classified, and the
 * gate applies the user's live role in the targeted project before a tool
 * touches anything. Only the access lookup and the content cores are faked.
 */

const h = vi.hoisted(() => ({
  access: vi.fn(),
  createIssue: vi.fn(),
  addComment: vi.fn(),
  board: vi.fn(),
}));

vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(),
  getProjectAccess: h.access,
}));
vi.mock("@/lib/server/create-issue", () => ({ createIssueForProject: h.createIssue }));
vi.mock("@/lib/server/add-comment", async (original) => ({
  ...await original<typeof import("@/lib/server/add-comment")>(),
  addCommentToIssue: h.addComment,
}));
vi.mock("@/lib/server/issue-reads", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-reads")>(),
  assertIssueInProject: async () => ({ ok: true }),
}));
vi.mock("@/lib/server/feedback/board-config", async (original) => ({
  ...await original<typeof import("@/lib/server/feedback/board-config")>(),
  getFeedbackBoardConfig: h.board,
}));

const { executeTool } = await import("./execute-tool");
const {
  CONVERSATION_ASSISTANT_TOOLS,
  GLOBAL_ASSISTANT_TOOLS,
  PROJECT_ASSISTANT_TOOLS,
} = await import("./tools");
const { NUMO_TOOL_CAPABILITIES, readerToolSet } = await import("./tool-capabilities");

const USER = "69300000-0000-4000-8000-000000000001";
const PROJECT = "69300000-0000-4000-8000-000000000002";
const ISSUE = "69300000-0000-4000-8000-000000000003";

function accessFor(role: ProjectAccess["role"], canComment = role !== "reader"): ProjectAccess {
  return {
    project: { id: PROJECT, key: "MIN", name: "minddy", owner_id: "owner" },
    isOwner: role === "owner",
    isMember: true,
    role,
    canWrite: role !== "reader",
    canComment,
  } as ProjectAccess;
}

const service = {
  from: () => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "in", "is", "order"]) builder[method] = () => builder;
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: PROJECT, name: "minddy", key: "MIN", owner_id: "owner" }], error: null }).then(resolve);
    return builder;
  },
} as unknown as SupabaseClient;

const ctx = {
  projectId: null,
  requireExplicitProjectTarget: true,
  userId: USER,
  supabase: service,
  service,
  locale: "en",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.createIssue.mockResolvedValue({ ok: true, issue: { id: ISSUE, number: 1 } });
  h.addComment.mockResolvedValue({ ok: true, comment: { id: "comment-1" } });
  h.board.mockResolvedValue({ exists: true, enabled: true, token: "board-token", public_url: "https://www.minddy.app/f/board-token" });
});

describe("Numo tool capabilities", () => {
  it("classifies every tool Numo can be offered, and nothing else", () => {
    const offered = new Set(
      [...CONVERSATION_ASSISTANT_TOOLS, ...GLOBAL_ASSISTANT_TOOLS, ...PROJECT_ASSISTANT_TOOLS]
        .map((tool) => tool.function.name),
    );
    expect([...offered].filter((name) => !(name in NUMO_TOOL_CAPABILITIES))).toEqual([]);
    expect(Object.keys(NUMO_TOOL_CAPABILITIES).filter((name) => !offered.has(name))).toEqual([]);
  });

  it("offers a reader's mention turn read tools only, plus comments when allowed", () => {
    const names = (canComment: boolean) =>
      readerToolSet(CONVERSATION_ASSISTANT_TOOLS, canComment).map((tool) => tool.function.name);
    expect(names(false)).toContain("get_issue");
    expect(names(false)).not.toContain("create_issue");
    expect(names(false)).not.toContain("add_comment");
    expect(names(false)).not.toContain("set_scratchpad");
    expect(names(true)).toContain("add_comment");
    expect(names(true)).not.toContain("respond_to_feedback");
  });

  it("refuses a write tool to a reader before the core runs", async () => {
    h.access.mockResolvedValue(accessFor("reader", true));
    const out = await executeTool("create_issue", { project_id: PROJECT, title: "Track it" }, ctx);
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toMatch(/Reader/);
    expect(h.createIssue).not.toHaveBeenCalled();
  });

  it("keeps the same write tool available to a member", async () => {
    h.access.mockResolvedValue(accessFor("member"));
    const out = await executeTool("create_issue", { project_id: PROJECT, title: "Track it" }, ctx);
    expect(out.success).toBe(true);
    expect(h.createIssue).toHaveBeenCalledTimes(1);
  });

  it("lets a reader comment only with the owner's permission", async () => {
    h.access.mockResolvedValue(accessFor("reader", false));
    const denied = await executeTool("add_comment", { project_id: PROJECT, issue_id: ISSUE, body: "Hi" }, ctx);
    expect(denied.success).toBe(false);
    expect(h.addComment).not.toHaveBeenCalled();

    h.access.mockResolvedValue(accessFor("reader", true));
    const allowed = await executeTool("add_comment", { project_id: PROJECT, issue_id: ISSUE, body: "Hi" }, ctx);
    expect(allowed.success).toBe(true);
    expect(h.addComment).toHaveBeenCalledTimes(1);
  });

  it("refuses a public feedback reply to a reader allowed to comment", async () => {
    h.access.mockResolvedValue(accessFor("reader", true));
    const out = await executeTool("respond_to_feedback", { project_id: PROJECT, post_id: ISSUE, body: "Hi" }, ctx);
    expect(out.success).toBe(false);
    expect(JSON.stringify(out.result)).toMatch(/Reader/);
  });

  it("returns the feedback board setup to a reader without its capability link", async () => {
    h.access.mockResolvedValue(accessFor("reader"));
    const reader = await executeTool("get_feedback_board", { project_id: PROJECT }, ctx);
    expect(reader.result).toMatchObject({ board: { exists: true, token: null, public_url: null } });

    h.access.mockResolvedValue(accessFor("member"));
    const member = await executeTool("get_feedback_board", { project_id: PROJECT }, ctx);
    expect(member.result).toMatchObject({ board: { token: "board-token" } });
  });
});
