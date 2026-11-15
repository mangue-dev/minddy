import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeTool, type ToolContext } from "./execute-tool";

// Pins the exact result Numo receives from get_objective and read_pull_request:
// the model reads these fields by name, so their names, order and values stay put.

const { getProjectAccess, getObjectiveForecast, resolvePullRequest, forge } = vi.hoisted(() => ({
  getProjectAccess: vi.fn(),
  getObjectiveForecast: vi.fn(),
  resolvePullRequest: vi.fn(),
  forge: {
    getPullRequest: vi.fn(),
    listPullRequestFiles: vi.fn(),
    listPullRequestReviewComments: vi.fn(),
    listReviewThreads: vi.fn(),
    listPullRequestComments: vi.fn(),
    listChecks: vi.fn(),
  },
}));
vi.mock("@/lib/server/objective-forecast", () => ({ getObjectiveForecast }));
vi.mock("./pull-request-writes", async (original) => ({
  ...await original<typeof import("./pull-request-writes")>(), resolvePullRequest,
}));
vi.mock("@/lib/server/auth-users", async (original) => ({
  ...await original<typeof import("@/lib/server/auth-users")>(),
  fetchAuthUsersById: async () => new Map([["user-2", { id: "user-2", email: "lea@example.com",
    user_metadata: { display_name: "Léa" } }]]),
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: async () => new Map([["key-1", { name: "Claude Code" }]]),
}));
vi.mock("@/lib/server/project-access", async (original) => ({
  ...await original<typeof import("@/lib/server/project-access")>(), getProjectAccess,
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => database() }));

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

function context(): ToolContext {
  return { projectId: null, userId: "user-1", supabase: database(), service: database(), locale: "en", timezone: "Europe/Paris" };
}

const objectiveId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherObjectiveId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccess.mockResolvedValue({ project: { id: "project-1", key: "MIN" }, isOwner: false, isMember: true,
    role: "member", canWrite: true, canComment: true });
  getObjectiveForecast.mockResolvedValue({ forecastDate: "2026-12-04T16:00:00.000Z", forecastDays: 21, basis: "contributors" });
  tables = {
    objectives: [
      { id: objectiveId, project_id: "project-1", name: "Release", description: "Ship it", status: "in_progress",
        lead_user_id: "user-2", target_date: "2026-12-01" },
      { id: otherObjectiveId, project_id: "project-1", name: "Foundation", description: null, status: "planned", lead_user_id: null },
    ],
    issues: [{ id: "issue-8", project_id: "project-1", number: 8, title: "Ship", status: "todo" }],
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
  };

  resolvePullRequest.mockResolvedValue({
    forge,
    target: { provider: "github", repoFullName: "acme/app", token: "token" },
    number: 12,
    row: { id: "pr-row-1", number: 12, provider: "github", repo_full_name: "acme/app" },
  });
  forge.getPullRequest.mockResolvedValue({ number: 12, url: "https://github.com/acme/app/pull/12", state: "closed",
    merged: true, title: "Add exports", body: "Fixes MIN-7", head: "feat/exports", base: "main", draft: false, headSha: "abc" });
  forge.listPullRequestFiles.mockResolvedValue({
    files: [
      { filename: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
      { filename: "src/big.ts", status: "added", additions: 900, deletions: 0, patch: "x".repeat(4005) },
      { filename: "logo.png", status: "added", additions: 0, deletions: 0 },
    ],
    truncated: true,
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
  forge.listPullRequestComments.mockResolvedValue([
    { id: 201, user: { login: "minddy[bot]" }, body: "Plan updated", created_at: "2026-10-22T08:00:00Z" },
    { id: 202, user: null, body: "y".repeat(2005), created_at: "2026-10-22T09:00:00Z" },
  ]);
  forge.listChecks.mockResolvedValue({
    state: "failure", passing: 1, total: 2,
    checks: [
      { name: "lint", state: "success", url: "https://ci/lint", description: null },
      { name: "test", state: "failure", url: "https://ci/test", description: "2 failed" },
    ],
  });
});

describe("Numo read tool outputs", () => {
  it("keeps the get_objective result", async () => {
    const result = await executeTool("get_objective", { project_id: "project-1", objective_id: objectiveId }, context());
    expect(JSON.stringify(result)).toMatchInlineSnapshot(`"{"result":{"objective":{"id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","name":"Release","description":"Ship it","status":"in_progress","lead_user_id":"user-2","target_date":"2026-12-01"},"forecast":{"estimated_finish_date":"2026-12-04T16:00:00.000Z","estimated_days":21,"basis":"contributors"},"comments":[{"id":"c1","author":"Léa","body":"Scope is frozen","parent_id":null,"created_at":"2026-10-20T10:00:00Z","resources":[{"id":"a1","kind":"link","url":"https://example.com/spec","title":"Spec"}]},{"id":"c2","author":"Numo","body":"Noted","parent_id":"c1","created_at":"2026-10-20T11:00:00Z"},{"id":"c3","author":"Claude Code (mcp)","body":"Pushed","parent_id":null,"created_at":"2026-10-20T12:00:00Z"}],"linked_feedback":[],"relations":[{"relation":"blocked_by","objective_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","name":"Foundation","status":"planned","lead_user_id":null},{"relation":"related","issue_id":"issue-8","identifier":"MIN-8","title":"Ship","status":"todo"}]},"success":true}"`);
  });

  it("keeps the read_pull_request result", async () => {
    const result = await executeTool("read_pull_request", { project_id: "project-1", issue_id: "issue-7" }, context());
    expect(JSON.stringify(result).replace(/x{100,}|y{100,}/g, (run) => `<${run[0]}×${run.length}>`)).toMatchInlineSnapshot(`"{"result":{"id":"pr-row-1","number":12,"url":"https://github.com/acme/app/pull/12","state":"merged","title":"Add exports","body":"Fixes MIN-7","head":"feat/exports","base":"main","draft":false,"checks":{"state":"failure","passing":1,"total":2,"failing":[{"name":"test","url":"https://ci/test"}]},"files":[{"filename":"src/a.ts","status":"modified","additions":2,"deletions":1,"patch":"@@ -1 +1 @@\\n-a\\n+b"},{"filename":"src/big.ts","status":"added","additions":900,"deletions":0,"patch":"<x×4000>\\n… (diff truncated)"},{"filename":"logo.png","status":"added","additions":0,"deletions":0,"patch":null}],"files_truncated":true,"review_comments":[{"id":101,"path":"src/a.ts","line":1,"original_line":1,"side":"RIGHT","start_line":null,"original_start_line":null,"outdated":false,"resolved":true,"diff_hunk":"@@ -1 +1 @@","comments":[{"author":"lea","body":"Why b?","created_at":"2026-10-21T08:00:00Z"},{"author":null,"body":"Because.","created_at":"2026-10-21T09:00:00Z"}]},{"id":103,"path":"src/big.ts","line":null,"original_line":4,"side":"LEFT","start_line":null,"original_start_line":2,"outdated":true,"resolved":false,"diff_hunk":"@@ -2,3 +2,3 @@","comments":[{"author":"camille","body":"Gone now","created_at":"2026-10-21T10:00:00Z"}]}],"conversation_comments":[{"id":201,"author":"minddy[bot]","body":"Plan updated","created_at":"2026-10-22T08:00:00Z"},{"id":202,"author":null,"body":"<y×2000>\\n… (comment truncated)","created_at":"2026-10-22T09:00:00Z"}]},"success":true}"`);
  });

  it("keeps the last thirty conversation comments", async () => {
    forge.listPullRequestComments.mockResolvedValue(Array.from({ length: 32 }, (_, index) => ({
      id: index, user: { login: "lea" }, body: `#${index}`, created_at: `2026-10-22T08:${String(index).padStart(2, "0")}:00Z`,
    })));
    const result = await executeTool("read_pull_request", { project_id: "project-1", issue_id: "issue-7" }, context());
    const comments = (result.result as { conversation_comments: Array<{ id: number }> }).conversation_comments;
    expect(comments.map((comment) => comment.id)).toEqual(Array.from({ length: 30 }, (_, index) => index + 2));
  });

  it("keeps the best-effort forge reads", async () => {
    forge.listPullRequestReviewComments.mockRejectedValue(new Error("403"));
    forge.listReviewThreads.mockRejectedValue(new Error("403"));
    forge.listPullRequestComments.mockRejectedValue(new Error("403"));
    forge.listChecks.mockRejectedValue(new Error("403"));
    const result = await executeTool("read_pull_request", { project_id: "project-1", issue_id: "issue-7" }, context());
    expect(result).toMatchObject({ success: true,
      result: { checks: null, review_comments: [], conversation_comments: [] } });
  });

  it("returns the resolution error", async () => {
    resolvePullRequest.mockResolvedValue({ error: "This issue has no pull request attached yet." });
    const result = await executeTool("read_pull_request", { project_id: "project-1", issue_id: "issue-7" }, context());
    expect(result).toEqual({ success: false, result: { error: "This issue has no pull request attached yet." } });
  });
});
