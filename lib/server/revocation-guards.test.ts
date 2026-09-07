import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";

/**
 * MIN-351 — WHAT MUST STOP WHEN YOU ARE REMOVED FROM A PROJECT.
 *
 * These cases shared one authorization mistake: "I wrote it" was treated as
 * proof of current access. After leaving a project, a former member therefore
 * retained control of comments and attachments, while inbox service-role
 * hydration kept exposing current issue titles and comment excerpts.
 *
 * This suite exercises the TypeScript resource and notification guards plus
 * the SQL policy definitions. The migration remains the source of truth for
 * database guards when this unit suite cannot connect to PostgreSQL.
 */

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const OTHER_PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";

// ─────────────────────────────────────────────────────────────────────────────
// Common fixtures
// ─────────────────────────────────────────────────────────────────────────────

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const accessibleProjectIds = vi.fn();
const removeStorageObjects = vi.fn();

/** Rows the service role attempted to read or delete, grouped by table. */
const serviceCalls: { deleted: string[]; read: Record<string, string[][]> } = {
  deleted: [],
  read: {},
};

let attachmentRow: Record<string, unknown> | null = null;
let notificationRows: Record<string, unknown>[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: (...args: unknown[]) => getAuthedUser(...args),
}));
vi.mock("@/lib/server/project-access", () => ({
  getProjectAccess: (...args: unknown[]) => getProjectAccess(...args),
  accessibleProjectIds: (...args: unknown[]) => accessibleProjectIds(...args),
}));
vi.mock("@/lib/server/attachments", () => ({
  removeStorageObjects: (...args: unknown[]) => removeStorageObjects(...args),
}));
vi.mock("@/lib/server/auth-users", () => ({
  fetchAuthUsersById: async () => new Map(),
  toNamed: (u: unknown) => u,
}));
vi.mock("@/lib/server/avatar-seeds", () => ({
  fetchAvatarSeeds: async () => new Map(),
}));
vi.mock("@/lib/server/api-key-actors", () => ({
  resolveApiKeyActors: async () => new Map(),
}));

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from(table: string) {
      const record = (ids: string[]) => {
        (serviceCalls.read[table] ??= []).push(ids);
      };
      return {
        select: () => {
          let rows: Record<string, unknown>[] = [];
          const query = {
            eq: () => query,
            in: (column: string, ids: string[]) => {
              if (column === "id") {
                record(ids);
                rows = ids.map((id) =>
                  table === "comments"
                    ? {
                        id,
                        issue_id: id.replace(/^c/, "i"),
                        objective_id: null,
                        feedback_post_id: null,
                        body: "b",
                        via_assistant: false,
                        via_mcp: false,
                        api_key_id: null,
                      }
                    : {
                        id,
                        project_id: PROJECT,
                        title: "t",
                        number: 1,
                      },
                );
              }
              return query;
            },
            is: () => query,
            maybeSingle: async () => ({ data: attachmentRow }),
            then: <TResult1 = { data: Record<string, unknown>[]; error: null }>(
              onfulfilled?:
                | ((value: {
                    data: Record<string, unknown>[];
                    error: null;
                  }) => TResult1 | PromiseLike<TResult1>)
                | null,
            ) => Promise.resolve({ data: rows, error: null }).then(onfulfilled),
          };
          return query;
        },
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  serviceCalls.deleted.push(RESOURCE);
                  return { data: { storage_path: "projects/x/f.pdf" }, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
  }),
}));

const { DELETE: deleteResource } = await import("@/app/api/resources/[id]/route");
const { GET: listNotifications } = await import("@/app/api/notifications/route");

function req(): never {
  return new Request("https://www.minddy.app/api/x", { method: "DELETE" }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceCalls.deleted = [];
  serviceCalls.read = {};
  attachmentRow = { project_id: PROJECT };
  notificationRows = [];
  getAuthedUser.mockResolvedValue({
    ok: true,
    user: { id: USER },
    supabase: {
      from: () => ({
        select: () => ({
          order: () => ({
            limit: async () => ({ data: notificationRows, error: null }),
          }),
        }),
      }),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resource deletion requires both authorship and current membership
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /api/resources/[id]", () => {
  it("rejects a depositor who is no longer a project member without erasing anything", async () => {
    getProjectAccess.mockResolvedValue(null);

    const response = await deleteResource(req(), {
      params: Promise.resolve({ id: RESOURCE }),
    });

    expect(response.status).toBe(404);
    expect(serviceCalls.deleted).toEqual([]);
    expect(removeStorageObjects).not.toHaveBeenCalled();
  });

  it("allows a depositor who is still a member through", async () => {
    getProjectAccess.mockResolvedValue({ isMember: true, isOwner: false, project: {} });

    const response = await deleteResource(req(), {
      params: Promise.resolve({ id: RESOURCE }),
    });

    expect(response.status).toBe(200);
    expect(serviceCalls.deleted).toEqual([RESOURCE]);
    expect(getProjectAccess).toHaveBeenCalledWith(USER, PROJECT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Inbox hydration only reads data from currently accessible projects
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/notifications", () => {
  it("discards rows from a project that was left and does not read their content", async () => {
    notificationRows = [
      { id: "n1", type: "comment", project_id: PROJECT, issue_id: "i1", comment_id: "c1" },
      {
        id: "n2",
        type: "comment",
        project_id: OTHER_PROJECT,
        issue_id: "i2",
        comment_id: "c2",
      },
    ];
    // The project that the user left does not pass the access recheck.
    accessibleProjectIds.mockResolvedValue(new Set([PROJECT]));

    const response = await listNotifications(req());
    const body = (await response.json()) as { id: string }[];

    expect(body.map((n) => n.id)).toEqual(["n1"]);
    // The foreign comment excerpt must never be requested. Filtering it only
    // after service-role hydration would already have disclosed the content.
    expect(serviceCalls.read.comments).toEqual([["c1"]]);
    expect(serviceCalls.read.issues).toEqual([["i1"]]);
  });

  it("keeps a row without a project — there is no access to recheck", async () => {
    notificationRows = [{ id: "n1", type: "assigned", project_id: null }];
    accessibleProjectIds.mockResolvedValue(new Set());

    const response = await listNotifications(req());
    const body = (await response.json()) as { id: string }[];

    expect(body.map((n) => n.id)).toEqual(["n1"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SQL-owned guards
// ─────────────────────────────────────────────────────────────────────────────

const baselineSql = canonicalSql(readBaseline());

/** Returns one policy definition from `create policy` through its semicolon. */
function policyBody(sql: string, name: string): string {
  const start = sql.indexOf(`create policy ${name} `);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end);
}

describe("policies (SQL)", () => {
  it.each(["comments_update", "comments_delete"])(
    "%s requires current access to the parent project as well as authorship",
    (name) => {
      const body = policyBody(baselineSql, name);
      expect(body).toMatch(/author_id = \( select auth\.uid\(\)(?: as uid)?\)/);
      expect(body).toContain("public.can_access_comment_parent(");
    },
  );

  it.each(["comments_insert", "page_comments_insert"])(
    "%s pins via_assistant and via_mcp to false",
    (name) => {
      const body = policyBody(baselineSql, name);
      expect(body).toContain("via_assistant = false");
      expect(body).toContain("via_mcp = false");
    },
  );

  it.each([
    "members_receive_broadcasts",
    "members_receive_page_presence",
    "members_track_page_presence",
  ])("%s parses malformed topics without a raw UUID cast", (name) => {
    const body = policyBody(baselineSql, name);
    // A malformed topic must return NULL instead of raising and breaking every
    // Realtime policy evaluation for the session.
    expect(body).toContain("public.can_access_project(public.topic_uuid(realtime.topic()))");
    expect(body).not.toMatch(/split_part\(realtime\.topic\(\), ':', 2\)::uuid/);
  });

  it("topic_uuid returns NULL instead of raising", () => {
    const sql = baselineSql;
    expect(sql).toContain("exception when others then return null;");
    // A policy caller needs EXECUTE or the function call itself raises (MIN-329).
    expect(sql).toMatch(/grant (?:execute|all) on function public\.topic_uuid\((?:topic )?text\) to authenticated/);
  });
});
