// Typed mentions as a reader may see them (MIN-734, MIN-872): the current
// label of a target they can open, and nothing of one they cannot.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ALLOWED = "11111111-1111-4111-8111-111111111111";
const HIDDEN = "22222222-2222-4222-8222-222222222222";
const ISSUE_OK = "33333333-3333-4333-8333-333333333331";
const ISSUE_HIDDEN = "33333333-3333-4333-8333-333333333332";
const PAGE_HIDDEN = "44444444-4444-4444-8444-444444444441";
const MEMBER = "55555555-5555-4555-8555-555555555551";
const STRANGER = "55555555-5555-4555-8555-555555555552";
const OWNER = "55555555-5555-4555-8555-555555555553";
const FILE_OK = "66666666-6666-4666-8666-666666666661";
const FILE_HIDDEN = "66666666-6666-4666-8666-666666666662";
const OBJECTIVE_OK = "77777777-7777-4777-8777-777777777771";
const OBJECTIVE_HIDDEN = "77777777-7777-4777-8777-777777777772";

const h = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));

function query(table: string) {
  let rows = h.tables[table] ?? [];
  const q = {
    select: () => q,
    in: (column: string, values: string[]) => {
      rows = rows.filter((row) => values.includes(String(row[column])));
      return q;
    },
    eq: (column: string, value: string) => {
      rows = rows.filter((row) => String(row[column]) === value);
      return q;
    },
    then: (resolve: (value: { data: unknown; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return q;
}
const service = { from: query } as never;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => query("issues") }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => query("objectives") }));
vi.mock("@/lib/server/page-content", () => ({ decodePageProjection: async (row: unknown) => row }));
vi.mock("@/lib/server/attachment-content", () => ({
  decodeAttachmentRow: async (_table: string, row: { file_name: string }) => ({
    ...row,
    file_name: row.file_name.replace(/^cipher:/, ""),
  }),
}));
vi.mock("@/lib/server/project-content", () => ({
  decodeProjectName: async (row: { name: string }) => row.name,
}));
vi.mock("@/lib/server/project-access", () => ({
  accessibleProjectIds: async (_user: string, ids: string[]) => new Set(ids.filter((id) => id === ALLOWED)),
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async (_service: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { id, user_metadata: { display_name: id === MEMBER ? "Jean Dupont" : "Someone" } }])),
  toNamed: (user: { user_metadata: { display_name: string } }) => ({ full_name: user.user_metadata.display_name }),
}));

const PR_OK = "88888888-8888-4888-8888-888888888881";
const PR_HIDDEN = "88888888-8888-4888-8888-888888888882";
const ROUTINE_OK = "99999999-9999-4999-8999-999999999991";
const CYCLE_MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const CYCLE_OTHER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const MCP_MINE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const MCP_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequestsWithProjects: async (ids: string[]) => [
    { pullRequest: { id: PR_OK, number: 12, title: "Fix login" }, projectIds: [HIDDEN, ALLOWED] },
    { pullRequest: { id: PR_HIDDEN, number: 13, title: "Secret branch" }, projectIds: [HIDDEN] },
  ].filter((row) => ids.includes(row.pullRequest.id)),
}));
vi.mock("@/lib/server/routine-content", () => ({
  decodeRoutineTitle: async (row: { title: string }) => row.title,
}));
vi.mock("@/lib/server/mcp-client", () => ({
  getMcpConnection: async (userId: string, id: string) =>
    userId === "reader" && id === MCP_MINE ? { id, name: "Linear" } : null,
}));

const { markdownForReader, readResultForReader, resolveMentionTargets } = await import("./mention-access");

beforeEach(() => {
  h.tables = {
    issues: [
      { id: ISSUE_OK, project_id: ALLOWED, number: 42, deleted_at: null },
      { id: ISSUE_HIDDEN, project_id: HIDDEN, number: 7, deleted_at: null },
    ],
    projects: [
      { id: ALLOWED, key: "MIN", name: "Minddy", deleted_at: null, owner_id: OWNER },
      { id: HIDDEN, key: "SEC", name: "Secret project", deleted_at: null },
    ],
    pages: [{ id: PAGE_HIDDEN, project_id: HIDDEN, title: "Secret roadmap", deleted_at: null }],
    objectives: [
      { id: OBJECTIVE_OK, project_id: ALLOWED, name: "Launch", status: "in_progress", deleted_at: null },
      { id: OBJECTIVE_HIDDEN, project_id: HIDDEN, name: "Secret goal", status: "done", deleted_at: null },
    ],
    attachments: [
      { id: FILE_OK, project_id: ALLOWED, file_name: "cipher:Spec v2.pdf" },
      { id: FILE_HIDDEN, project_id: HIDDEN, file_name: "cipher:Secret budget.xlsx" },
    ],
    project_members: [
      { project_id: ALLOWED, user_id: MEMBER },
      { project_id: HIDDEN, user_id: STRANGER },
    ],
    agent_routines: [{ id: ROUTINE_OK, project_id: ALLOWED, title: "Weekly triage", deleted_at: null }],
    cycles: [
      { id: CYCLE_MINE, user_id: "reader", start_date: "2026-10-26", end_date: "2026-11-08" },
      { id: CYCLE_OTHER, user_id: STRANGER, start_date: "2026-10-26", end_date: "2026-11-08" },
    ],
  };
});

describe("resolving mention targets", () => {
  it("returns the status of an objective the reader can open, and nothing of a hidden one", async () => {
    const statuses = new Map<string, string>();
    const resolution = await resolveMentionTargets("reader", [
      { type: "objective", id: OBJECTIVE_OK },
      { type: "objective", id: OBJECTIVE_HIDDEN },
    ], undefined, statuses as never);
    expect(resolution.get(`objective:${OBJECTIVE_OK}`)).toBe("Launch");
    expect(resolution.get(`objective:${OBJECTIVE_HIDDEN}`)).toBeNull();
    expect(Object.fromEntries(statuses)).toEqual({ [`objective:${OBJECTIVE_OK}`]: "in_progress" });
  });

  it("names a resource by its decoded name, only inside a project the reader can open", async () => {
    const resolution = await resolveMentionTargets("reader", [
      { type: "resource", id: FILE_OK },
      { type: "resource", id: FILE_HIDDEN },
    ]);
    expect(resolution.get(`resource:${FILE_OK}`)).toBe("Spec v2.pdf");
    expect(resolution.get(`resource:${FILE_HIDDEN}`)).toBeNull();
  });

  it("gives the current label of what the reader can open, and null otherwise", async () => {
    const resolution = await resolveMentionTargets("reader", [
      { type: "issue", id: ISSUE_OK },
      { type: "issue", id: ISSUE_HIDDEN },
      { type: "page", id: PAGE_HIDDEN },
      { type: "project", id: HIDDEN },
      { type: "member", id: MEMBER },
      { type: "member", id: STRANGER },
      { type: "member", id: OWNER },
      { type: "issue", id: "not-a-uuid" },
    ]);
    expect(Object.fromEntries(resolution)).toEqual({
      [`issue:${ISSUE_OK}`]: "MIN-42",
      [`issue:${ISSUE_HIDDEN}`]: null,
      [`page:${PAGE_HIDDEN}`]: null,
      [`project:${HIDDEN}`]: null,
      [`member:${MEMBER}`]: "Jean Dupont",
      [`member:${STRANGER}`]: null,
      [`member:${OWNER}`]: "Someone",
      "issue:not-a-uuid": null,
    });
  });

  it("follows renames and hides inaccessible names in what agents read", async () => {
    const markdown = `See [@MIN-1](mention:issue/${ISSUE_OK}) and [@Secret roadmap](mention:page/${PAGE_HIDDEN}).`;
    expect(await markdownForReader("reader", markdown, service)).toBe(
      `See [@MIN-42](mention:issue/${ISSUE_OK}) and [@unavailable](mention:page/${PAGE_HIDDEN}).`);
    const read = await readResultForReader("reader", { issue: { description: markdown }, count: 1 });
    expect(JSON.stringify(read)).not.toContain("Secret roadmap");
    expect(read.count).toBe(1);
  });

  it("resolves the MIN-872 types under their own access rules", async () => {
    const resolution = await resolveMentionTargets("reader", [
      { type: "pull_request", id: PR_OK },
      { type: "pull_request", id: PR_HIDDEN },
      { type: "routine", id: ROUTINE_OK },
      { type: "cycle", id: CYCLE_MINE },
      { type: "cycle", id: CYCLE_OTHER },
      { type: "mcp", id: MCP_MINE },
      { type: "mcp", id: MCP_OTHER },
      { type: "skill", id: "release", meta: { project: ALLOWED } },
      { type: "skill", id: "release", meta: { project: HIDDEN } },
      { type: "skill", id: "release" },
      { type: "scratchpad", id: "notebook" },
      { type: "date", id: "2026-11-02", meta: { time: "09:30" } },
      { type: "date", id: "2026-02-31" },
    ]);
    expect(Object.fromEntries(resolution)).toEqual({
      [`pull_request:${PR_OK}`]: "#12 Fix login",
      [`pull_request:${PR_HIDDEN}`]: null,
      [`routine:${ROUTINE_OK}`]: "Weekly triage",
      [`cycle:${CYCLE_MINE}`]: "Cycle 2026-10-26 → 2026-11-08",
      [`cycle:${CYCLE_OTHER}`]: null,
      [`mcp:${MCP_MINE}`]: "Linear",
      [`mcp:${MCP_OTHER}`]: null,
      [`skill:${ALLOWED}/release`]: "release",
      [`skill:${HIDDEN}/release`]: null,
      "skill:release": null,
      "scratchpad:notebook": "Task notebook",
      "date:2026-11-02": "2026-11-02 09:30",
      "date:2026-02-31": null,
    });
  });

  it("names label-less mentions for agents, and never an inaccessible one", async () => {
    const markdown = `Ship [@](mention:pull_request/${PR_OK}) after [@](mention:pull_request/${PR_HIDDEN}) on [@](mention:date/2026-11-02).`;
    expect(await markdownForReader("reader", markdown, service)).toBe(
      `Ship [@\\#12 Fix login](mention:pull_request/${PR_OK}) after [@unavailable](mention:pull_request/${PR_HIDDEN}) on [@2026-11-02](mention:date/2026-11-02).`);
  });

  it("keeps nothing of a mention a list's truncation cut", async () => {
    const read = await readResultForReader("reader", { issues: [{ description: "Plan with [@Secret ro…" }] });
    expect(read.issues[0].description).toBe("Plan with @…");
  });
});
