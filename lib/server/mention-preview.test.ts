// The hover card of a mention (MIN-879): details of a target the reader may
// open, and nothing at all of one they may not.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PROJECT = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT = "22222222-2222-4222-8222-222222222222";
const ISSUE = "33333333-3333-4333-8333-333333333331";
const BLOCKER = "33333333-3333-4333-8333-333333333332";
const OBJECTIVE = "77777777-7777-4777-8777-777777777771";
const MEMBER = "55555555-5555-4555-8555-555555555551";
const OWNER = "55555555-5555-4555-8555-555555555553";
const CYCLE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MCP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

const h = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  visible: new Set<string>(),
  reads: [] as string[],
  resolved: [] as string[],
}));

function query(table: string) {
  h.reads.push(table);
  let rows = h.tables[table] ?? [];
  let head = false;
  let total: number | null = null;
  const q = {
    select: (_columns?: string, options?: { head?: boolean }) => {
      head = !!options?.head;
      return q;
    },
    in: (column: string, values: string[]) => {
      rows = rows.filter((row) => values.includes(String(row[column])));
      return q;
    },
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return q;
    },
    is: (column: string, value: unknown) => {
      rows = rows.filter((row) => (row[column] ?? null) === value);
      return q;
    },
    not: (column: string, _op: string, list: string) => {
      const excluded = list.replace(/[()]/g, "").split(",");
      rows = rows.filter((row) => !excluded.includes(String(row[column])));
      return q;
    },
    or: (filter: string) => {
      const ids = [...filter.matchAll(/eq\.([0-9a-f-]+)/g)].map((match) => match[1]);
      rows = rows.filter((row) => ids.includes(String(row.source_id)) || ids.includes(String(row.target_id)));
      return q;
    },
    order: () => q,
    limit: (count: number) => {
      total = rows.length;
      rows = rows.slice(0, count);
      return q;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (value: { data: unknown; count: number; error: null }) => unknown) =>
      resolve({ data: head ? null : rows, count: total ?? rows.length, error: null }),
  };
  return q;
}
const service = { from: query } as never;

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));
vi.mock("@/lib/server/mention-access", () => ({
  resolveMentionTargets: async (_user: string, refs: Array<{ type: string; id: string }>) => {
    h.resolved.push(...refs.map((ref) => ref.type));
    return new Map(refs.map((ref) => [`${ref.type}:${ref.id}`, h.visible.has(ref.id) ? "label" : null]));
  },
}));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => query("issues") }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => query("objectives") }));
vi.mock("@/lib/server/category-store", () => ({ categoryStore: () => query("categories") }));
vi.mock("@/lib/server/project-content", () => ({ decodeProject: async (row: unknown) => row }));
vi.mock("@/lib/server/project-access", () => ({
  accessibleProjectIds: async (_user: string, ids: string[]) => new Set(ids.filter((id) => id === PROJECT)),
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async (_service: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, { id, email: `${id.slice(0, 4)}@example.com`, user_metadata: { display_name: "Camille Roy" } }])),
  toNamed: (user: { email: string; user_metadata: { display_name: string } }) =>
    ({ email: user.email, full_name: user.user_metadata.display_name }),
}));
vi.mock("@/lib/server/avatar-seeds", () => ({
  fetchAvatarSeeds: async (_service: unknown, ids: string[]) => new Map(ids.map((id) => [id, `seed-${id.slice(0, 4)}`])),
}));
vi.mock("@/lib/server/mcp-client", () => ({
  getMcpConnection: async (userId: string, id: string) => userId === "reader" && id === MCP
    ? { id, name: "Linear", url: "https://mcp.linear.app/mcp", enabled: true, auth_mode: "oauth", oauth_connected: false, token_encrypted: null }
    : null,
}));
const PAGE = "44444444-4444-4444-8444-444444444441";
vi.mock("@/lib/server/pages", () => ({
  getPage: async (id: string) => {
    const page = h.tables.pages?.find((row) => row.id === id && h.visible.has(id));
    return page ? { ok: true, page } : { ok: false, status: 404, errorKey: "pageNotFound" };
  },
}));
vi.mock("@/lib/server/pages-projection", () => ({ pageBodyToMarkdownServer: async () => "## Body" }));
vi.mock("@/lib/server/page-content", () => ({ decodePageProjection: async (row: unknown) => row }));
vi.mock("@/lib/server/routines", () => ({ getRoutineForUser: vi.fn() }));
vi.mock("@/lib/server/scratchpad", () => ({ getScratchpad: vi.fn() }));
vi.mock("@/lib/server/agent/pull-requests", () => ({ findPullRequestsWithProjects: async () => [] }));
vi.mock("@/lib/server/repository-skills", () => ({
  listProjectRepositorySkills: async () => [],
  loadProjectRepositorySkills: async () => null,
}));

const { previewMentionTarget } = await import("./mention-preview");

beforeEach(() => {
  h.reads = [];
  h.resolved = [];
  h.visible = new Set([ISSUE, OBJECTIVE, MEMBER, CYCLE, MCP]);
  h.tables = {
    projects: [
      { id: PROJECT, key: "MIN", name: "Minddy", owner_id: OWNER, orb_seed: null, icon_url: null },
      { id: OTHER_PROJECT, key: "SEC", name: "Secret", owner_id: OWNER, orb_seed: null, icon_url: null },
    ],
    issues: [
      {
        id: ISSUE, project_id: PROJECT, number: 42, title: "Fix login", description: "x".repeat(1_000),
        status: "in_progress", priority: "high", effort: "m", assignee_id: MEMBER, objective_id: OBJECTIVE,
        due_date: null, recurrence: null, plan: "- [x] one\n- [ ] two", parent_id: null, deleted_at: null,
        issue_categories: [{ category_id: "cat" }], cycle_id: CYCLE,
      },
      {
        id: BLOCKER, project_id: PROJECT, number: 7, title: "Rotate keys", status: "todo", effort: null,
        objective_id: OBJECTIVE, deleted_at: null, cycle_id: null,
      },
      { id: "hidden-issue", project_id: OTHER_PROJECT, number: 1, status: "done", effort: "s", deleted_at: null, cycle_id: CYCLE },
    ],
    issue_relations: [
      { id: "rel", project_id: PROJECT, source_id: BLOCKER, source_type: "issue", target_id: ISSUE, target_type: "issue", type: "blocks" },
    ],
    categories: [{ id: "cat", project_id: PROJECT, name: "Bug", color: "#f00" }],
    objectives: [
      { id: OBJECTIVE, project_id: PROJECT, name: "Launch", color: "#0af", status: "in_progress", lead_user_id: OWNER, description: "## Why\nShip it", target_date: null, deleted_at: null },
    ],
    project_members: [{ project_id: PROJECT, user_id: MEMBER, role: "reader", created_at: "2026-09-01T10:00:00Z" }],
    cycles: [{ id: CYCLE, user_id: "reader", start_date: "2026-10-26", end_date: "2026-11-09" }],
    pages: [
      {
        id: PAGE, project_id: PROJECT, parent_id: null, title: "Releases", icon: null, updated_at: null, content: null,
        database_title_name: null, database_schema: [{ id: "status", name: "Status", type: "text" }],
      },
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `row-${index}`, project_id: PROJECT, parent_id: PAGE, title: `0.${index}`, icon: null,
        property_values: { status: "Shipped" }, created_at: "2026-10-01", deleted_at: null,
      })),
    ],
  };
});

describe("previewMentionTarget", () => {
  it("reads nothing of a target the reader may not see", async () => {
    h.visible.clear();
    expect(await previewMentionTarget("reader", { type: "issue", id: ISSUE }, null, service)).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it("gives an issue as its board card shows it, relations and assignee included", async () => {
    const preview = await previewMentionTarget("reader", { type: "issue", id: ISSUE }, null, service);
    expect(preview?.type).toBe("issue");
    if (preview?.type !== "issue") return;
    expect(preview.project).toMatchObject({ key: "MIN", name: "Minddy" });
    expect(preview.issue).toMatchObject({ number: 42, title: "Fix login", category_ids: ["cat"], objective_id: OBJECTIVE });
    expect(preview.issue.description).toHaveLength(400);
    expect(preview.categories).toEqual([{ id: "cat", name: "Bug", color: "#f00" }]);
    expect(preview.objective).toMatchObject({ id: OBJECTIVE, name: "Launch" });
    expect(preview.assignee).toMatchObject({ user_id: MEMBER, role: "reader", full_name: "Camille Roy" });
    expect(preview.relations).toEqual([
      expect.objectContaining({ relation: "blocked_by", otherId: BLOCKER, otherNumber: 7, otherStatus: "todo" }),
    ]);
  });

  it("gives an objective its tickets, lead and description", async () => {
    const preview = await previewMentionTarget("reader", { type: "objective", id: OBJECTIVE }, null, service);
    if (preview?.type !== "objective") throw new Error("expected an objective");
    expect(preview.issues).toHaveLength(2);
    expect(preview.lead).toMatchObject({ user_id: OWNER });
    expect(preview.excerpt).toBe("## Why\nShip it");
  });

  it("names a member's role only in a project the reader shares", async () => {
    const inProject = await previewMentionTarget("reader", { type: "member", id: MEMBER }, PROJECT, service);
    expect(inProject).toMatchObject({
      type: "member",
      name: "Camille Roy",
      avatarSeed: "seed-5555",
      membership: { projectName: "Minddy", role: "reader", joinedAt: "2026-09-01T10:00:00Z" },
    });
    // Read elsewhere, or without a project: their role in a project both share.
    const elsewhere = await previewMentionTarget("reader", { type: "member", id: MEMBER }, OTHER_PROJECT, service);
    expect(elsewhere).toMatchObject({ type: "member", membership: { projectName: "Minddy", role: "reader" } });
  });

  it("gives the owner their role even without a membership row", async () => {
    h.visible.add(OWNER);
    const preview = await previewMentionTarget("reader", { type: "member", id: OWNER }, null, service);
    expect(preview).toMatchObject({ type: "member", membership: { projectName: "Minddy", role: "owner", joinedAt: null } });
  });

  it("lists a project's members, its owner first, with their roles", async () => {
    h.visible.add(PROJECT);
    const preview = await previewMentionTarget("reader", { type: "project", id: PROJECT }, null, service);
    expect(preview).toMatchObject({
      type: "project",
      memberCount: 2,
      members: [
        { userId: OWNER, role: "owner", avatarSeed: "seed-5555" },
        { userId: MEMBER, role: "reader" },
      ],
    });
  });

  it("counts only the cycle's tickets of projects the reader may open", async () => {
    const preview = await previewMentionTarget("reader", { type: "cycle", id: CYCLE }, null, service);
    expect(preview).toEqual({
      type: "cycle",
      startDate: "2026-10-26",
      endDate: "2026-11-09",
      issues: [{ status: "in_progress", effort: "m" }],
    });
  });

  it("reads a database's first rows and counts the rest, never the project's page list", async () => {
    h.visible.add(PAGE);
    const preview = await previewMentionTarget("reader", { type: "page", id: PAGE }, null, service);
    if (preview?.type !== "page") throw new Error("expected a page");
    expect(preview.database?.rows).toHaveLength(4);
    expect(preview.database?.total).toBe(9);
    expect(preview.database?.rows[0]).toEqual({ title: "0.0", icon: null, cells: [{ kind: "text", text: "Shipped" }] });
    // Its own guarded reader decides access: no second resolution of it.
    expect(h.resolved).toEqual([]);
  });

  it("gives nothing of a page its reader may not open", async () => {
    expect(await previewMentionTarget("reader", { type: "page", id: PAGE }, null, service)).toBeNull();
    expect(h.reads).toEqual([]);
  });

  it("says whether an MCP connection is signed in, without its credentials", async () => {
    const preview = await previewMentionTarget("reader", { type: "mcp", id: MCP }, null, service);
    expect(preview).toEqual({
      type: "mcp", id: MCP, name: "Linear", service: "linear", enabled: true, auth: "oauth", connected: false,
    });
  });
});
