import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerMinddyTools } from "./tools";
import type { ToolExtra, ToolResult } from "./tool-helpers";

const { getIssue, listPullRequestsForIssues } = vi.hoisted(() => ({
  getIssue: vi.fn(),
  listPullRequestsForIssues: vi.fn(),
}));
vi.mock("@/lib/server/issue-reads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/issue-reads")>()),
  getIssue,
}));
vi.mock("@/lib/server/agent/pull-requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/agent/pull-requests")>()),
  listPullRequestsForIssues,
}));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/issue-event-store", () => ({
  readIssueEvents: vi.fn(async () => ({ data: [], error: null })),
}));
vi.mock("./tool-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tool-helpers")>();
  return {
    ...actual,
    requireProject: vi.fn(async () => ({
      userId: "user-1",
      keyId: null,
      access: { project: { id: "project-1", key: "MIN" } },
    })),
    resolveIssueRef: vi.fn(async () => ({ issue: { id: "issue-1", identifier: "MIN-42" } })),
  };
});

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

const issue = {
  id: "issue-1",
  project_id: "project-1",
  number: 42,
  title: "Keyboard navigation",
  status: "todo",
  plan: "- [x] a\n- [ ] b",
};

async function read(args: Record<string, unknown> = {}) {
  const result = await handlers.get("minddy_get_issue")!(
    { project_id: "project-1", issue: "MIN-42", ...args },
    {},
  );
  expect(result.isError).not.toBe(true);
  const text = result.content.find((part) => part.type === "text");
  return JSON.parse((text as { text: string }).text) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getIssue.mockResolvedValue({ issue, comments: [], sub_issues: [], relations: [] });
  listPullRequestsForIssues.mockResolvedValue(new Map());
});

describe("minddy_get_issue brief", () => {
  it("returns no brief unless one is asked for", async () => {
    const result = await read();
    expect(result).not.toHaveProperty("brief");
    expect(listPullRequestsForIssues).not.toHaveBeenCalled();
  });

  it("puts the procedure first, ahead of the issue it applies to", async () => {
    const result = await read({ brief: "implement" });
    expect(Object.keys(result)[0]).toBe("brief");
    expect(result.brief).toContain("Implement this minddy issue.");
    expect(result.brief).toContain("(1/2 tasks done): it is the `plan` field of this result.");
    expect(result.brief).toContain("`min-42-keyboard-navigation` is only a suggested branch name");
    expect(result.issue).toMatchObject({ number: 42 });
  });

  it("continues the open pull request the issue already has", async () => {
    listPullRequestsForIssues.mockResolvedValue(new Map([["issue-1", [{
      number: 12, state: "open", url: "https://example.test/pull/12",
      head_branch: "feature/keys", base_branch: "main",
    }]]]));
    expect((await read({ brief: "implement" })).brief).toContain("continue on its branch");
  });

  it("reports unknown pull requests instead of failing the read", async () => {
    listPullRequestsForIssues.mockRejectedValue(new Error("down"));
    const result = await read({ brief: "verify" });
    expect(result.brief).toContain("Linked pull request information could not be loaded");
    expect(result.issue).toMatchObject({ number: 42 });
  });
});
