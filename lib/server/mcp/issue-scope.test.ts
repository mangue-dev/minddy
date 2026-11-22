import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/server";
import type { ProjectAccess } from "@/lib/server/project-access";
import type { ToolExtra, ToolResult } from "./tool-helpers";

/**
 * MIN-952: an issue UUID or a KEY-N identifier names its project, so the MCP
 * tools that designate issues no longer need `project_id`. The handlers run
 * through the real `registerMinddyTools`, the real scope helpers and the real
 * reference resolvers over an in-memory database; only the access lookup and
 * the write cores are faked.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  roles: new Map<string, "owner" | "member" | "reader">(),
  addComment: vi.fn(),
  updateIssueFields: vi.fn(),
}));

/**
 * The query subset the resolvers use: equality, membership, null, case-insensitive key,
 * the owner-or-member `or`, then `maybeSingle()` or a plain await.
 */
function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const rows = () => (h.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  const builder = {
    select: () => builder,
    order: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return builder;
    },
    ilike: (column: string, value: string) => {
      filters.push((row) => String(row[column]).toLowerCase() === value.toLowerCase());
      return builder;
    },
    or: (expression: string) => {
      const owner = /owner_id\.eq\.([^,]+)/.exec(expression)?.[1];
      const ids = /id\.in\.\(([^)]*)\)/.exec(expression)?.[1]?.split(",") ?? [];
      filters.push((row) => row.owner_id === owner || ids.includes(String(row.id)));
      return builder;
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: rows(), error: null }),
  };
  return builder;
}

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: query }) }));
vi.mock("@/lib/server/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/lib/server/project-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/project-access")>()),
  getProjectAccess: async (_userId: string, projectId: string) => {
    const role = h.roles.get(projectId);
    const project = h.tables.projects.find((p) => p.id === projectId);
    if (!role || !project) return null;
    return {
      project: { id: project.id, key: project.key, name: project.name, owner_id: project.owner_id },
      isOwner: role === "owner",
      isMember: true,
      role,
      canWrite: role !== "reader",
      canComment: role !== "reader",
    } as unknown as ProjectAccess;
  },
}));
vi.mock("@/lib/server/add-comment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/add-comment")>()),
  addCommentToIssue: h.addComment,
}));
vi.mock("@/lib/server/update-issue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/update-issue")>()),
  updateIssueFields: h.updateIssueFields,
}));

const { registerMinddyTools } = await import("./tools");
const { locateIssueProject } = await import("@/lib/server/issue-reads");

type Handler = (args: Record<string, unknown>, extra: ToolExtra) => Promise<ToolResult>;
const handlers = new Map<string, Handler>();
registerMinddyTools({
  registerTool(name: string, _config: unknown, handler: Handler) {
    handlers.set(name, handler);
  },
} as unknown as McpServer);

const USER = "user-1";
const MINE = "11111111-1111-4111-8111-111111111111";
const SHARED = "22222222-2222-4222-8222-222222222222";
const FOREIGN = "33333333-3333-4333-8333-333333333333";
const SAME_KEY = "44444444-4444-4444-8444-444444444444";
const ISSUE_MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ISSUE_SHARED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ISSUE_FOREIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

let call = 0;
async function run(name: string, args: Record<string, unknown>) {
  // A distinct key per call keeps the per-user rate limit out of the way.
  call += 1;
  const extra = { http: { authInfo: { extra: { userId: USER, keyId: `key-${call}` } } } } as unknown as ToolExtra;
  const result = await handlers.get(name)!(args, extra);
  return { result, body: JSON.parse(result.content[0].text) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.tables = {
    projects: [
      { id: MINE, key: "MIN", name: "minddy", owner_id: USER },
      { id: SHARED, key: "OPS", name: "ops", owner_id: "someone" },
      { id: FOREIGN, key: "SEC", name: "secret", owner_id: "stranger" },
    ],
    project_members: [{ project_id: SHARED, user_id: USER, role: "reader" }],
    issues: [
      { id: ISSUE_MINE, project_id: MINE, number: 42 },
      { id: ISSUE_SHARED, project_id: SHARED, number: 7 },
      { id: ISSUE_FOREIGN, project_id: FOREIGN, number: 3 },
    ],
  };
  h.roles = new Map([[MINE, "owner"], [SHARED, "reader"]]);
  h.addComment.mockResolvedValue({ ok: true, comment: { id: "comment-1" } });
  h.updateIssueFields.mockResolvedValue({ ok: true });
});

describe("locateIssueProject", () => {
  const locate = (ref: string) => locateIssueProject(
    { from: query } as unknown as Parameters<typeof locateIssueProject>[0], USER, ref);

  it("finds the project of an issue UUID and of an identifier, whatever its case", async () => {
    expect(await locate(ISSUE_SHARED)).toEqual({ projectId: SHARED });
    expect(await locate("min-42")).toEqual({ projectId: MINE });
  });

  it("refuses a bare number, which names no project", async () => {
    expect(await locate("42")).toMatchObject({ code: "project_required" });
  });

  it("answers like a missing issue for a project the user cannot open", async () => {
    expect(await locate(ISSUE_FOREIGN)).toMatchObject({ code: "issue_not_found" });
    expect(await locate("SEC-3")).toMatchObject({ code: "issue_not_found" });
  });

  it("lists the candidates when two visible projects share the key and the issue number", async () => {
    h.tables.projects.push({ id: SAME_KEY, key: "MIN", name: "minddy two", owner_id: USER });
    h.tables.issues.push({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", project_id: SAME_KEY, number: 42 });
    const located = await locate("MIN-42");
    expect(located).toMatchObject({ code: "ambiguous_issue_ref" });
    expect("candidates" in located && located.candidates?.map((c) => c.project_id).sort())
      .toEqual([MINE, SAME_KEY].sort());
  });

  it("picks the one project holding the number when the key is shared", async () => {
    h.tables.projects.push({ id: SAME_KEY, key: "MIN", name: "minddy two", owner_id: USER });
    expect(await locate("MIN-42")).toEqual({ projectId: MINE });
    expect(await locate("MIN-99")).toMatchObject({ code: "issue_not_found" });
  });
});

describe("MCP tools without project_id (MIN-952)", () => {
  it("comments on an issue named by its UUID alone", async () => {
    const { result } = await run("minddy_add_comment", { issue: ISSUE_MINE, body: "Hi" });
    expect(result.isError).not.toBe(true);
    expect(h.addComment).toHaveBeenCalledWith(expect.objectContaining({ issueId: ISSUE_MINE }));
  });

  it("comments on an issue named by its identifier alone", async () => {
    const { result } = await run("minddy_add_comment", { issue: "MIN-42", body: "Hi" });
    expect(result.isError).not.toBe(true);
    expect(h.addComment).toHaveBeenCalledWith(expect.objectContaining({ issueId: ISSUE_MINE }));
  });

  it("asks for project_id with a bare number", async () => {
    const { body } = await run("minddy_add_comment", { issue: "42", body: "Hi" });
    expect(body.error.code).toBe("project_required");
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it("returns the candidate projects of an ambiguous key", async () => {
    h.tables.projects.push({ id: SAME_KEY, key: "MIN", name: "minddy two", owner_id: USER });
    h.tables.issues.push({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", project_id: SAME_KEY, number: 42 });
    const { body } = await run("minddy_add_comment", { issue: "MIN-42", body: "Hi" });
    expect(body.error.code).toBe("ambiguous_issue_ref");
    expect(body.error.candidates).toHaveLength(2);
  });

  it("refuses a project_id that contradicts the issue", async () => {
    const { body } = await run("minddy_add_comment", { project_id: MINE, issue: ISSUE_SHARED, body: "Hi" });
    expect(body.error.code).toBe("issue_not_found");
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it("keeps resolving a bare number in an explicit project", async () => {
    const { result } = await run("minddy_add_comment", { project_id: MINE, issue: "42", body: "Hi" });
    expect(result.isError).not.toBe(true);
  });

  it("never reaches an issue of a project outside the caller's reach", async () => {
    const { body } = await run("minddy_add_comment", { issue: ISSUE_FOREIGN, body: "Hi" });
    expect(body.error.code).toBe("issue_not_found");
    expect(h.addComment).not.toHaveBeenCalled();
  });

  it("still checks the role in the project it found", async () => {
    const { body } = await run("minddy_update_issues", { issues: ["OPS-7"], fields: { priority: "high" } });
    expect(body.error.code).toBe("forbidden");
    expect(h.updateIssueFields).not.toHaveBeenCalled();
  });

  it("locates a bulk call from the first reference that names a project", async () => {
    const { body } = await run("minddy_update_issues", { issues: ["42", "MIN-42"], fields: { priority: "high" } });
    expect(body.failed).toEqual([expect.objectContaining({ issue: "MIN-42" })]);
    expect(h.updateIssueFields).toHaveBeenCalledTimes(1);
  });
});
