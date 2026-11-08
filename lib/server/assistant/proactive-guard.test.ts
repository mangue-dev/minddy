import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The background guard (MIN-929) against an in-memory database that honors
 * its filters: a sensitive action is refused without a memory that allows it
 * and accepted with one, a write in a shared project stays on what is the
 * user's (read from the arguments that tool really uses), and an urgent note
 * is capped atomically. Reads and the user's own planning pass untouched.
 */

const USER = "11111111-1111-4111-8111-111111111111";
const TEAMMATE = "22222222-2222-4222-8222-222222222222";
const SOLO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHARED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const THEIRS = "abababab-abab-4bab-8bab-abababababab";
const INVITED = "acacacac-acac-4cac-8cac-acacacacacac";
const MEMORY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SOLO_MEMORY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SHARED_MEMORY = "dededede-dede-4ede-8ede-dededededede";
const MY_ISSUE = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const THEIR_ISSUE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const SOLO_ISSUE = "12121212-1212-4212-8212-121212121212";
const MY_PAGE = "34343434-3434-4434-8434-343434343434";
const THEIR_PAGE = "56565656-5656-4656-8656-565656565656";
const POST = "78787878-7878-4878-8878-787878787878";
const SHARED_VIEW = "90909090-9090-4090-8090-909090909090";

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, urgentClaims: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("./project-scope", () => ({
  resolveAssistantProjectTarget: async (_ctx: unknown, _context: unknown, requested: unknown) =>
    ({ projectId: typeof requested === "string" ? requested : null }),
}));
vi.mock("@/lib/server/numo/memory-content", () => ({
  getNumoMemoryScope: async (_service: unknown, userId: string, id: string) => {
    const memory = db.tables.numo_memories.find((row) => row.id === id && row.user_id === userId);
    return memory ? { id, project_id: memory.project_id ?? null } : null;
  },
}));
vi.mock("@/lib/server/issue-reads", () => ({
  resolveIssueRef: async (_db: unknown, scope: { projectId: string }, ref: string) => {
    const issue = db.tables.issues.find((row) => row.id === ref && row.project_id === scope.projectId);
    return issue ? { issue: { id: ref, number: 1, identifier: "X-1" } } : { error: "not found", code: "issue_not_found" };
  },
}));

/** Just enough of PostgREST for the guard's queries. */
function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let head = false;
  const rows = () => (db.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
  const chain = {
    select: (_columns?: string, options?: { head?: boolean }) => { head = !!options?.head; return chain; },
    eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return chain; },
    neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return chain; },
    in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return chain; },
    is: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => void) =>
      resolve(head ? { count: rows().length, error: null } : { data: rows(), error: null }),
  };
  return chain;
}

vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => query("issues") }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => query("objectives") }));
vi.mock("@/lib/server/feedback-post-store", () => ({ feedbackPostStore: () => query("feedback_posts") }));
vi.mock("@/lib/server/members", () => ({
  countPendingInvitations: async (_service: unknown, projectId: string) =>
    db.tables.project_invitations.filter((row) => row.project_id === projectId && row.status === "pending").length,
}));

import { guardProactiveTool, proactiveToolSet, SCOPED_WRITES } from "./proactive-guard";
import { NUMO_TOOL_CAPABILITIES } from "./tool-capabilities";
import type { AssistantToolDef } from "./tools";

const ctx = {
  userId: USER,
  service: {
    from: query,
    rpc: async (name: string, args: { p_limit: number }) => {
      if (name !== "claim_numo_urgent_note") throw new Error(name);
      if (db.urgentClaims >= args.p_limit) return { data: false, error: null };
      db.urgentClaims++;
      return { data: true, error: null };
    },
  } as never,
  projectId: null,
  requireExplicitProjectTarget: true,
  turnId: "turn-1",
};

beforeEach(() => {
  db.urgentClaims = 0;
  db.tables = {
    projects: [
      { id: SOLO, key: "SOL", owner_id: USER },
      { id: SHARED, key: "SHR", owner_id: USER },
      { id: THEIRS, key: "THR", owner_id: TEAMMATE },
      { id: INVITED, key: "INV", owner_id: USER },
    ],
    project_members: [
      { project_id: SHARED, user_id: TEAMMATE },
      { project_id: THEIRS, user_id: USER },
    ],
    project_invitations: [{ id: "i-1", project_id: INVITED, status: "pending" }],
    numo_memories: [
      { id: MEMORY, user_id: USER, project_id: null },
      { id: SOLO_MEMORY, user_id: USER, project_id: SOLO },
      { id: SHARED_MEMORY, user_id: USER, project_id: SHARED },
    ],
    issues: [
      { id: MY_ISSUE, project_id: SHARED, assignee_id: USER, created_by: TEAMMATE },
      { id: THEIR_ISSUE, project_id: SHARED, assignee_id: TEAMMATE, created_by: TEAMMATE },
      { id: SOLO_ISSUE, project_id: SOLO, assignee_id: null, created_by: USER },
    ],
    pages: [
      { id: MY_PAGE, project_id: SHARED, created_by: USER },
      { id: THEIR_PAGE, project_id: SHARED, created_by: TEAMMATE },
    ],
    objectives: [],
    feedback_posts: [{ id: POST, project_id: SHARED }],
    views: [{ id: SHARED_VIEW, user_id: null, project_id: SHARED }],
  };
});

const ok = async (tool: string, args: Row) => (await guardProactiveTool(tool, args, ctx)).ok;

describe("guardProactiveTool: sensitive actions", () => {
  it("refuses a deletion without a memory, and accepts it with one, dropping authorized_by", async () => {
    const refused = await guardProactiveTool("move_to_trash", { type: "issue", id: SOLO_ISSUE }, ctx);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toMatch(/journal entry/);
    expect(await guardProactiveTool("move_to_trash", { type: "issue", id: SOLO_ISSUE, authorized_by: SOLO_MEMORY }, ctx))
      .toEqual({ ok: true, args: { type: "issue", id: SOLO_ISSUE } });
  });

  it("checks the memory against the trash item's own project, not the one the call names", async () => {
    // The issue is in SHARED: a SOLO memory does not allow it, whatever project_id says.
    expect(await ok("move_to_trash", { type: "issue", id: MY_ISSUE, project_id: SOLO, authorized_by: SOLO_MEMORY }))
      .toBe(false);
    expect(await ok("move_to_trash", { type: "issue", id: MY_ISSUE, authorized_by: SHARED_MEMORY })).toBe(true);
    expect(await ok("restore_from_trash", { type: "project", id: SHARED })).toBe(false);
  });

  it("treats an unknown memory, or something that is not a memory id, as no authorization", async () => {
    expect(await ok("merge_pull_request", { project_id: SHARED, authorized_by: "99999999-9999-4999-8999-999999999999" }))
      .toBe(false);
    const none = await guardProactiveTool("merge_pull_request", { project_id: SHARED, authorized_by: "none" }, ctx);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.error).toMatch(/sensitive/);
  });

  it("treats an external MCP call as sensitive, allowed by a memory of any scope", async () => {
    expect(await ok("call_mcp_tool", { server: "exa", tool: "search" })).toBe(false);
    expect(await ok("call_mcp_tool", { server: "exa", authorized_by: SOLO_MEMORY })).toBe(true);
  });

  it("guards administration and refuses the tools that wait for an answer", async () => {
    expect(await ok("invite_member", { project_id: SOLO, email: "a@b.c" })).toBe(false);
    expect(await ok("ask_user", { question: "?" })).toBe(false);
  });
});

describe("guardProactiveTool: scope", () => {
  it("lets reads and the user's own planning through", async () => {
    expect(await ok("get_issue", { project_id: SHARED, issue: THEIR_ISSUE })).toBe(true);
    expect(await ok("add_scratchpad_tasks", { tasks: ["x"] })).toBe(true);
    expect(await ok("list_integrations", { project_id: SHARED })).toBe(true);
  });

  it("lets any write through in a project where the user is alone", async () => {
    expect(await ok("create_issue", { project_id: SOLO, title: "x" })).toBe(true);
  });

  it("counts a pending invitation as sharing the project", async () => {
    expect(await ok("create_issue", { project_id: INVITED, title: "x" })).toBe(false);
  });

  it("in a shared project, writes only on what is the user's", async () => {
    expect(await ok("add_comment", { project_id: SHARED, issue_id: MY_ISSUE, body: "x" })).toBe(true);
    const theirs = await guardProactiveTool("add_comment", { project_id: SHARED, issue_id: THEIR_ISSUE, body: "x" }, ctx);
    expect(theirs.ok).toBe(false);
    if (!theirs.ok) expect(theirs.error).toMatch(/other members/);
    expect(await ok("update_issues", { project_id: SHARED, issue_ids: [MY_ISSUE], updates: [{ issue_id: THEIR_ISSUE }] }))
      .toBe(false);
    expect(await ok("create_issue", { project_id: SHARED, title: "x" })).toBe(false);
    // In a project someone else owns, the user is a member: shared too.
    expect(await ok("create_issue", { project_id: THEIRS, title: "x" })).toBe(false);
  });

  it("ignores decoy arguments the tool does not use", async () => {
    // create_objective changes the project whatever issue_id says.
    expect(await ok("create_objective", { project_id: SHARED, name: "x", issue_id: MY_ISSUE })).toBe(false);
    expect(await ok("update_category", { project_id: SHARED, category_id: "c", issue_id: MY_ISSUE })).toBe(false);
    // Moving the user's page under a teammate's page changes theirs too.
    expect(await ok("update_page", { project_id: SHARED, page_id: MY_PAGE, parent_page_id: THEIR_PAGE })).toBe(false);
    expect(await ok("update_page", { project_id: SHARED, page_id: MY_PAGE, title: "x" })).toBe(true);
    // A relation shows on both issues.
    expect(await ok("link_issues", { project_id: SHARED, issue_id: MY_ISSUE, target_issue_id: THEIR_ISSUE, relation: "related" }))
      .toBe(false);
  });

  it("checks that the feedback named is on the user's board", async () => {
    expect(await ok("add_feedback_comment", { project_id: SHARED, feedback_post_id: POST, body: "x" })).toBe(true);
    expect(await ok("add_feedback_comment", { project_id: SHARED, feedback_post_id: "not-a-post", body: "x" }))
      .toBe(false);
  });

  it("fails closed on a project write the guard does not know", async () => {
    expect(await ok("some_future_write", { project_id: SHARED })).toBe(false);
  });

  it("accepts a write outside the user's objects when a memory covers that project", async () => {
    expect(await ok("add_comment", { project_id: SHARED, issue_id: THEIR_ISSUE, body: "x", authorized_by: SHARED_MEMORY }))
      .toBe(true);
    expect(await ok("add_comment", { project_id: SHARED, issue_id: THEIR_ISSUE, body: "x", authorized_by: SOLO_MEMORY }))
      .toBe(false);
  });

  it("does not let the user's cycle take a teammate's issue", async () => {
    expect(await ok("add_issues_to_cycle", { issue_ids: [MY_ISSUE, SOLO_ISSUE] })).toBe(true);
    expect(await ok("add_issues_to_cycle", { issue_ids: [THEIR_ISSUE] })).toBe(false);
  });

  it("keeps shared views to the project's rules", async () => {
    expect(await ok("create_view", { name: "Mine", project_id: SHARED, personal: true })).toBe(true);
    expect(await ok("create_view", { name: "Team", project_id: SHARED })).toBe(false);
    expect(await ok("update_view", { view_id: SHARED_VIEW, name: "x" })).toBe(false);
  });
});

describe("guardProactiveTool: notes", () => {
  it("refuses a note that is neither asked for nor urgent", async () => {
    expect(await ok("notify_me", { project_id: SOLO, title: "t", body: "b" })).toBe(false);
    expect(await ok("notify_me", { project_id: SOLO, title: "t", body: "b", urgent: true, urgency_reason: "now" }))
      .toBe(false);
  });

  it("sends an urgent note with its reason, up to the daily cap", async () => {
    const args = { project_id: SOLO, title: "t", body: "b", urgent: true, urgency_reason: "Production is down since 9am." };
    expect(await guardProactiveTool("notify_me", args, ctx))
      .toEqual({ ok: true, args: { project_id: SOLO, title: "t", body: "b", urgent: true } });
    expect(await ok("notify_me", args)).toBe(true);
    expect(await ok("notify_me", args)).toBe(false);
  });

  it("sends a note the user asked for, without taking an urgent slot", async () => {
    db.urgentClaims = 2;
    expect(await guardProactiveTool("notify_me", { project_id: SOLO, title: "t", body: "b", authorized_by: MEMORY }, ctx))
      .toEqual({ ok: true, args: { project_id: SOLO, title: "t", body: "b" } });
  });
});

describe("proactiveToolSet", () => {
  const tool = (name: string): AssistantToolDef => ({
    type: "function",
    function: { name, description: name, parameters: { type: "object", properties: { project_id: {} } } },
  });

  it("drops the tools that wait for an answer and offers authorized_by on the guarded ones", () => {
    const tools = proactiveToolSet(["ask_user", "get_issue", "move_to_trash", "add_comment", "notify_me"].map(tool));
    const byName = new Map(tools.map((t) => [t.function.name, Object.keys(t.function.parameters.properties)]));
    expect(byName.has("ask_user")).toBe(false);
    expect(byName.get("get_issue")).toEqual(["project_id"]);
    expect(byName.get("move_to_trash")).toContain("authorized_by");
    expect(byName.get("add_comment")).toContain("authorized_by");
    expect(byName.get("notify_me")).toEqual(expect.arrayContaining(["authorized_by", "urgent", "urgency_reason"]));
  });

  it("maps only real tools, so a renamed tool fails closed rather than being skipped silently", () => {
    for (const name of Object.keys(SCOPED_WRITES)) expect(NUMO_TOOL_CAPABILITIES).toHaveProperty(name);
  });
});
