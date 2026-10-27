import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ProjectAccess } from "@/lib/server/project-access";
import type { ToolExtra, ToolResult } from "./tool-helpers";

/**
 * MIN-693: every MCP tool declares the project capability it needs, and the
 * declaration is enforced against the caller's live role. The handlers run
 * through the real `registerMinddyTools` wrappers and the real
 * `requireProject`; only the access lookup and the content cores are faked.
 */

const h = vi.hoisted(() => ({
  access: vi.fn(),
  addComment: vi.fn(),
  addRelation: vi.fn(),
  listIntegrations: vi.fn(),
  boardConfig: vi.fn(),
}));

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/project-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/project-access")>()),
  getProjectAccess: h.access,
}));
vi.mock("@/lib/server/issue-reads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/issue-reads")>()),
  resolveIssueRef: async (_client: unknown, _project: unknown, ref: string) => ({
    issue: { id: `id-${ref}`, identifier: ref },
  }),
}));
vi.mock("@/lib/server/add-comment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/add-comment")>()),
  addCommentToIssue: h.addComment,
}));
vi.mock("@/lib/server/issue-relations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/issue-relations")>()),
  addIssueRelation: h.addRelation,
  findIssueRelation: vi.fn(),
  removeIssueRelation: vi.fn(),
}));
vi.mock("@/lib/server/integrations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/integrations")>()),
  listIntegrations: h.listIntegrations,
}));
vi.mock("@/lib/server/feedback/board-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/feedback/board-config")>()),
  getFeedbackBoardConfig: h.boardConfig,
}));

const { registerMinddyTools } = await import("./tools");
const { MCP_TOOL_CAPABILITIES } = await import("./tool-capabilities");

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

const PROJECT = "11111111-1111-4111-8111-111111111111";
let user = 0;

function accessFor(
  role: ProjectAccess["role"],
  canComment = role !== "reader",
): ProjectAccess {
  return {
    project: { id: PROJECT, key: "MIN", name: "minddy", owner_id: "owner" },
    isOwner: role === "owner",
    isMember: true,
    role,
    canWrite: role !== "reader",
    canComment,
  } as ProjectAccess;
}

async function call(name: string, args: Record<string, unknown> = {}) {
  // A distinct user per call keeps the per-user rate limit out of the way.
  user += 1;
  const extra = { http: { authInfo: { extra: { userId: `user-${user}` } } } } as unknown as ToolExtra;
  const result = await handlers.get(name)!({ project_id: PROJECT, ...args }, extra);
  return { result, body: JSON.parse(result.content[0].text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.addComment.mockResolvedValue({ ok: true, comment: { id: "comment-1" } });
  h.addRelation.mockResolvedValue({ ok: true });
  h.listIntegrations.mockResolvedValue([]);
  h.boardConfig.mockResolvedValue({
    exists: true,
    enabled: true,
    token: "board-token",
    public_url: "https://www.minddy.app/f/board-token",
    sso_configured: false,
  });
});

describe("MCP tool capabilities", () => {
  it("classifies exactly the registered tools", () => {
    expect([...handlers.keys()].sort()).toEqual(
      Object.keys(MCP_TOOL_CAPABILITIES).sort(),
    );
  });

  it("refuses a write tool to a reader with a stable error code", async () => {
    h.access.mockResolvedValue(accessFor("reader", true));
    const { result, body } = await call("minddy_link_issues", {
      issue: "MIN-1",
      target: "MIN-2",
      relation: "blocks",
    });
    expect(result.isError).toBe(true);
    expect(body.error.code).toBe("forbidden");
    expect(h.addRelation).not.toHaveBeenCalled();
  });

  it("keeps the same write tool available to a member", async () => {
    h.access.mockResolvedValue(accessFor("member"));
    const { result } = await call("minddy_link_issues", {
      issue: "MIN-1",
      target: "MIN-2",
      relation: "blocks",
    });
    expect(result.isError).not.toBe(true);
    expect(h.addRelation).toHaveBeenCalledTimes(1);
  });

  it("lets a reader comment only when the owner allowed it", async () => {
    h.access.mockResolvedValue(accessFor("reader", false));
    const denied = await call("minddy_add_comment", { issue: "MIN-1", body: "Hi" });
    expect(denied.body.error.code).toBe("forbidden");
    expect(h.addComment).not.toHaveBeenCalled();

    h.access.mockResolvedValue(accessFor("reader", true));
    const allowed = await call("minddy_add_comment", { issue: "MIN-1", body: "Hi" });
    expect(allowed.result.isError).not.toBe(true);
    expect(h.addComment).toHaveBeenCalledTimes(1);
  });

  it("forwards a thread reply's parent to the comment core", async () => {
    h.access.mockResolvedValue(accessFor("member"));
    const parent = "00000000-0000-4000-8000-000000000001";
    await call("minddy_add_comment", { issue: "MIN-1", body: "Done", parent_comment_id: parent });
    expect(h.addComment).toHaveBeenCalledWith(expect.objectContaining({ parentId: parent }));

    await call("minddy_add_comment", { issue: "MIN-1", body: "Done" });
    expect(h.addComment).toHaveBeenLastCalledWith(expect.objectContaining({ parentId: null }));
  });

  it("explains a reply to a comment of another issue", async () => {
    h.access.mockResolvedValue(accessFor("member"));
    h.addComment.mockResolvedValue({ ok: false, status: 404, errorKey: "commentNotFound" });
    const { body } = await call("minddy_add_comment", {
      issue: "MIN-1", body: "Done", parent_comment_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(body.error.code).toBe("not_found");
    expect(body.error.message).toContain("minddy_get_issue");
  });

  it("hides integration summaries from readers", async () => {
    h.access.mockResolvedValue(accessFor("reader", true));
    expect((await call("minddy_list_integrations")).body.error.code).toBe("forbidden");
    expect(h.listIntegrations).not.toHaveBeenCalled();

    h.access.mockResolvedValue(accessFor("member"));
    expect((await call("minddy_list_integrations")).result.isError).not.toBe(true);
  });

  it("returns the feedback board setup to a reader without its capability link", async () => {
    h.access.mockResolvedValue(accessFor("reader"));
    const reader = await call("minddy_get_feedback_board");
    expect(reader.body.board).toMatchObject({ exists: true, token: null, public_url: null });

    h.access.mockResolvedValue(accessFor("member"));
    const member = await call("minddy_get_feedback_board");
    expect(member.body.board.token).toBe("board-token");
  });

  it("keeps owner-only tools away from members", async () => {
    h.access.mockResolvedValue(accessFor("member"));
    const { body } = await call("minddy_revoke_integration", {
      integration_id: "22222222-2222-4222-8222-222222222222",
    });
    expect(body.error.code).toBe("forbidden");
  });
});
