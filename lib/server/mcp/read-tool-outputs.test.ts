import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/server";
import { registerMinddyTools } from "./tools";
import type { ToolExtra, ToolResult } from "./tool-helpers";

// Pins the exact wire text of the MCP objective and pull request reads: field
// names, their order and their values are part of the public contract.

const { findPullRequestForIssue, resolveLinkedRepository, forge, readIssueEvents } = vi.hoisted(() => ({
  findPullRequestForIssue: vi.fn(),
  resolveLinkedRepository: vi.fn(),
  forge: {
    getPullRequest: vi.fn(),
    listPullRequestFiles: vi.fn(),
    listPullRequestReviewComments: vi.fn(),
    listReviewThreads: vi.fn(),
    listPullRequestComments: vi.fn(),
    listChecks: vi.fn(),
  },
  readIssueEvents: vi.fn(),
}));

vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => database() }));
vi.mock("@/lib/server/auth-users", async (original) => ({
  ...await original<typeof import("@/lib/server/auth-users")>(),
  fetchAuthUsersById: async () => new Map([
    ["user-1", { id: "user-1", email: "camille@example.com", user_metadata: { display_name: "Camille" } }],
    ["user-2", { id: "user-2", email: "lea@example.com", user_metadata: { display_name: "Léa" } }],
  ]),
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: async () => new Map([["key-1", { name: "Claude Code" }]]),
}));
vi.mock("@/lib/server/issue-event-store", async (original) => ({
  ...await original<typeof import("@/lib/server/issue-event-store")>(), readIssueEvents,
}));
vi.mock("@/lib/server/feedback/team-queries", async (original) => ({
  ...await original<typeof import("@/lib/server/feedback/team-queries")>(),
  listFeedbackForObjective: async () => [{ id: "fb-1", title: "Faster exports", votes: 3 }],
}));
vi.mock("@/lib/server/agent/pull-requests", async (original) => ({
  ...await original<typeof import("@/lib/server/agent/pull-requests")>(), findPullRequestForIssue,
}));
vi.mock("@/lib/server/agent/repo-access", async (original) => ({
  ...await original<typeof import("@/lib/server/agent/repo-access")>(), resolveLinkedRepository,
}));
vi.mock("@/lib/server/agent/forge", async (original) => ({
  ...await original<typeof import("@/lib/server/agent/forge")>(), forgeFor: () => forge,
}));
vi.mock("./tool-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tool-helpers")>();
  const { withIssueScopeMocks } = await import("@/test/mcp-issue-scope-mocks");
  return withIssueScopeMocks({
    ...actual,
    requireProject: vi.fn(async () => ({ userId: "user-1", keyId: null, access: { project: { id: "project-1", key: "MIN" } } })),
    resolveIssueRef: vi.fn(async (_access: unknown, ref: string) => ({ issue: { id: "issue-1", identifier: ref } })),
  });
});

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;

function database(): SupabaseClient {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      const query = {
        select: () => query,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        is(column: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) === value);
          return query;
        },
        not(column: string, _operator: string, value: unknown) {
          filters.push((row) => (row[column] ?? null) !== value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        or: () => query,
        order: () => query,
        range: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: rows(), error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
}

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

const objectiveId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherObjectiveId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  tables = {
    objectives: [
      { id: objectiveId, project_id: "project-1", name: "Release", description: "Ship it", status: "in_progress",
        lead_user_id: "user-2", target_date: "2026-12-01", created_at: "2026-10-01T00:00:00Z" },
      { id: otherObjectiveId, project_id: "project-1", name: "Foundation", description: null, status: "planned", lead_user_id: null },
    ],
    issues: [
      { id: "issue-7", project_id: "project-1", objective_id: objectiveId, number: 7, title: "Prepare", status: "done",
        priority: "high", effort: "m", assignee_id: "user-1" },
      { id: "issue-8", project_id: "project-1", objective_id: objectiveId, number: 8, title: "Ship", status: "todo",
        priority: "none", effort: null, assignee_id: null },
    ],
    issue_relations: [
      { id: "r1", project_id: "project-1", source_id: otherObjectiveId, source_type: "objective", target_id: objectiveId,
        target_type: "objective", type: "blocks" },
      { id: "r2", project_id: "project-1", source_id: objectiveId, source_type: "objective", target_id: "issue-8",
        target_type: "issue", type: "related" },
    ],
    comments: [
      { id: "c1", objective_id: objectiveId, author_id: "user-2", body: "Scope is frozen", parent_id: null,
        via_assistant: false, via_mcp: false, api_key_id: null, created_at: "2026-10-20T10:00:00Z" },
      { id: "c2", objective_id: objectiveId, author_id: "user-1", body: "Noted", parent_id: "c1",
        via_assistant: true, via_mcp: false, api_key_id: null, created_at: "2026-10-20T11:00:00Z" },
      { id: "c3", objective_id: objectiveId, author_id: "user-1", body: "Pushed", parent_id: null,
        via_assistant: false, via_mcp: true, api_key_id: "key-1", created_at: "2026-10-20T12:00:00Z" },
    ],
    attachments: [
      { id: "a1", objective_id: objectiveId, comment_id: "c1", kind: "link", url: "https://example.com/spec",
        file_name: "Spec", mime_type: null, size_bytes: null, page_id: null },
      { id: "a2", objective_id: objectiveId, comment_id: null, kind: "link", url: "https://example.com/own",
        file_name: "Own", mime_type: null, size_bytes: null, page_id: null },
    ],
    integrations: [],
  };
  readIssueEvents.mockResolvedValue({
    data: [{ id: "e1", type: "updated", field: "status", from_value: "planned", to_value: "in_progress",
      actor_id: "user-2", via_assistant: false, via_mcp: false, api_key_id: null, integration_id: null,
      created_at: "2026-10-19T09:00:00Z" }],
    error: null,
  });

  findPullRequestForIssue.mockResolvedValue({ id: "pr-row-1", number: 12, provider: "github", repo_full_name: "acme/app" });
  resolveLinkedRepository.mockResolvedValue({ provider: "github", repoFullName: "acme/app", defaultBranch: "main",
    token: "token", linkId: "link-1", connectionId: "connection-1", externalRepoId: "1" });
  forge.getPullRequest.mockResolvedValue({ number: 12, url: "https://github.com/acme/app/pull/12", state: "open",
    merged: false, title: "Add exports", body: "Fixes MIN-7", head: "feat/exports", base: "main", draft: true, headSha: "abc" });
  forge.listPullRequestFiles.mockResolvedValue({
    files: [
      { filename: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
      { filename: "src/big.ts", status: "added", additions: 900, deletions: 0, patch: "x".repeat(4005) },
      { filename: "logo.png", status: "added", additions: 0, deletions: 0 },
    ],
    truncated: false,
  });
  forge.listPullRequestReviewComments.mockResolvedValue([
    { id: 101, path: "src/a.ts", line: 1, original_line: 1, side: "RIGHT", start_line: null, original_start_line: null,
      diff_hunk: "@@ -1 +1 @@", html_url: "https://github.com/acme/app/pull/12#r101", in_reply_to_id: null,
      user: { login: "lea" }, body: "Why b?", created_at: "2026-10-21T08:00:00Z" },
    { id: 102, path: "src/a.ts", line: 1, original_line: 1, side: "RIGHT", start_line: null, original_start_line: null,
      diff_hunk: "@@ -1 +1 @@", html_url: "https://github.com/acme/app/pull/12#r102", in_reply_to_id: 101,
      user: null, body: "Because.", created_at: "2026-10-21T09:00:00Z" },
    { id: 103, path: "src/big.ts", line: null, original_line: 4, side: "LEFT", start_line: null, original_start_line: 2,
      diff_hunk: "@@ -2,3 +2,3 @@", html_url: "https://github.com/acme/app/pull/12#r103", in_reply_to_id: null,
      user: { login: "camille" }, body: "Gone now", created_at: "2026-10-21T10:00:00Z" },
  ]);
  forge.listReviewThreads.mockResolvedValue([{ rootCommentId: 101, threadId: "PRRT_1", resolved: true, resolvedBy: "lea", outdated: false }]);
  forge.listPullRequestComments.mockResolvedValue([]);
  forge.listChecks.mockResolvedValue({
    state: "failure", passing: 1, total: 2,
    checks: [
      { name: "lint", state: "success", url: "https://ci/lint", description: null },
      { name: "test", state: "failure", url: "https://ci/test", description: "2 failed" },
    ],
  });
});

describe("MCP read tool outputs", () => {
  it("keeps the minddy_get_objective wire text", async () => {
    const result = await handlers.get("minddy_get_objective")!({ project_id: "project-1", objective_id: objectiveId }, {});
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toMatchInlineSnapshot(`"{"linked_feedback":[{"id":"fb-1","title":"Faster exports","votes":3}],"objective":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","project_id":"project-1","name":"Release","description":"Ship it","status":"in_progress","lead_user_id":"user-2","target_date":"2026-12-01","created_at":"2026-10-01T00:00:00Z","lead_name":"Léa","progress":{"done":1,"total":2,"percent":50},"resources":[{"id":"a2","kind":"link","url":"https://example.com/own","title":"Own"}]},"issues":[{"id":"issue-7","identifier":"MIN-7","title":"Prepare","status":"done","priority":"high","effort":"m","assignee_id":"user-1","assignee_name":"Camille"},{"id":"issue-8","identifier":"MIN-8","title":"Ship","status":"todo","priority":"none","effort":null,"assignee_id":null,"assignee_name":null}],"relations":[{"relation":"blocked_by","objective_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","name":"Foundation","status":"planned","lead_user_id":null},{"relation":"related","issue_id":"issue-8","identifier":"MIN-8","title":"Ship","status":"todo"}],"comments":[{"id":"c1","author":"Léa","body":"Scope is frozen","parent_id":null,"created_at":"2026-10-20T10:00:00Z","resources":[{"id":"a1","kind":"link","url":"https://example.com/spec","title":"Spec"}]},{"id":"c2","author":"Numo","body":"Noted","parent_id":"c1","created_at":"2026-10-20T11:00:00Z"},{"id":"c3","author":"Claude Code (mcp)","body":"Pushed","parent_id":null,"created_at":"2026-10-20T12:00:00Z"}],"activity":[{"actor":"Léa","type":"updated","field":"status","from_value":"planned","to_value":"in_progress","created_at":"2026-10-19T09:00:00Z"}]}"`);
  });

  it("keeps the minddy_get_objective errors", async () => {
    tables.objectives.shift();
    const result = await handlers.get("minddy_get_objective")!({ project_id: "project-1", objective_id: objectiveId }, {});
    expect(result).toEqual({ isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: { code: "not_found", message: "Objective not found in this project." } }) }] });
  });

  it("keeps the minddy_get_pull_request wire text", async () => {
    const result = await handlers.get("minddy_get_pull_request")!({ project_id: "project-1", issue: "MIN-7" }, {});
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toMatchInlineSnapshot(`"{"pull_request":{"number":12,"url":"https://github.com/acme/app/pull/12","state":"open","title":"Add exports","body":"Fixes MIN-7","head":"feat/exports","base":"main","draft":true,"checks":{"state":"failure","passing":1,"total":2,"failing":[{"name":"test","url":"https://ci/test","description":"2 failed"}]},"repository":"acme/app","issue":{"id":"issue-1","identifier":"MIN-7"},"files":[{"filename":"src/a.ts","status":"modified","additions":2,"deletions":1,"patch":"@@ -1 +1 @@\\n-a\\n+b"},{"filename":"src/big.ts","status":"added","additions":900,"deletions":0,"patch":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\\n… (diff truncated)"},{"filename":"logo.png","status":"added","additions":0,"deletions":0,"patch":null}],"files_truncated":false,"review_comments":[{"id":101,"path":"src/a.ts","line":1,"original_line":1,"side":"RIGHT","start_line":null,"original_start_line":null,"outdated":false,"resolved":true,"diff_hunk":"@@ -1 +1 @@","url":"https://github.com/acme/app/pull/12#r101","comments":[{"author":"lea","body":"Why b?","created_at":"2026-10-21T08:00:00Z"},{"author":null,"body":"Because.","created_at":"2026-10-21T09:00:00Z"}]},{"id":103,"path":"src/big.ts","line":null,"original_line":4,"side":"LEFT","start_line":null,"original_start_line":2,"outdated":true,"resolved":false,"diff_hunk":"@@ -2,3 +2,3 @@","url":"https://github.com/acme/app/pull/12#r103","comments":[{"author":"camille","body":"Gone now","created_at":"2026-10-21T10:00:00Z"}]}]}}"`);
    expect(forge.listPullRequestComments).not.toHaveBeenCalled();
  });

  it("keeps the best-effort reads of minddy_get_pull_request", async () => {
    forge.listPullRequestReviewComments.mockRejectedValue(new Error("403"));
    forge.listReviewThreads.mockRejectedValue(new Error("403"));
    forge.listChecks.mockRejectedValue(new Error("403"));
    const result = await handlers.get("minddy_get_pull_request")!({ project_id: "project-1", issue: "MIN-7" }, {});
    expect(JSON.parse(result.content[0].text).pull_request).toMatchObject({ checks: null, review_comments: [] });
  });

  it.each([
    ["no linked pull request", () => findPullRequestForIssue.mockResolvedValue(null),
      "pull_request_not_found", "Issue 'MIN-7' has no pull request linked yet."],
    ["no repository", () => resolveLinkedRepository.mockResolvedValue(null),
      "no_repository", "This project has no linked repository."],
    ["another repository", () => findPullRequestForIssue.mockResolvedValue({ id: "pr-row-1", number: 12, provider: "github", repo_full_name: "acme/other" }),
      "pull_request_not_found", "The pull request of 'MIN-7' is not in this project's repository."],
    ["a forge failure", () => forge.getPullRequest.mockRejectedValue(new Error("Bad credentials")),
      "github_error", "Bad credentials"],
  ])("keeps the minddy_get_pull_request error for %s", async (_label, arrange, code, message) => {
    arrange();
    const result = await handlers.get("minddy_get_pull_request")!({ project_id: "project-1", issue: "MIN-7" }, {});
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code, message } }) }] });
  });
});
