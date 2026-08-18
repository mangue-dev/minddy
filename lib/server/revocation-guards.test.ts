import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";

/**
 * MIN-351 — WHAT SHOULD STOP WHEN YOU'RE REMOVED FROM A PROJECT.
 *
 * The common thread in these cases is a single confusion: "I wrote it"
 * was taken for authorization. This is proof of belonging to the
 * LINE, not the right to touch it today. Removed from the project, the former member
 * therefore kept control of his comments, his attachments, and a window
 * for continuous reading on tickets via his inbox — which
 * rehydrated titles and LIVE extracts into service key.
 *
 * This that we exercise here: the two guards written in TypeScript (resources,
 * notifications), and the content of the policies for those who live in SQL — the
 * database cannot be reached from the suite, but the migration is the
 * source of truth of what will be placed there, and a guard removed by distraction
 * is seen here.
 */

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "07b14964-0def-4941-8ddf-686572d6345d";
const OTHER_PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";

// ─────────────────────────────────────────────────────────────────────────────
// Common decor
// ─────────────────────────────────────────────────────────────────────────────

const getAuthedUser = vi.fn();
const getProjectAccess = vi.fn();
const accessibleProjectIds = vi.fn();
const removeStorageObjects = vi.fn();

/** What the service key actually read or erased, per table. */
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
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: attachmentRow }) }),
          }),
          in: (_column: string, ids: string[]) => {
            record(ids);
            // A live line per requested id: this test talks about what is READ,
            // not the trash filter (`targetAlive`), which would discard everything if
            // l'hydratation rendait vide.
            const rows = ids.map((id) => ({ id, title: "t", number: 1, body: "b" }));
            return Object.assign(Promise.resolve({ data: rows, error: null }), {
              is: async () => ({ data: rows, error: null }),
            });
          },
        }),
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
// The resource: depositor AND member
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
// The inbox: what we have the right to RE-READ
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
    // The left project does not appear in the access recheck.
    accessibleProjectIds.mockResolvedValue(new Set([PROJECT]));

    const response = await listNotifications(req());
    const body = (await response.json()) as { id: string }[];

    expect(body.map((n) => n.id)).toEqual(["n1"]);
    // And above all: the extract from the comment of the other project was never
    // request. Filtering the display afterwards would not have been enough — reading
    // in service key IS the leak.
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
// The guards who live in SQL
// ─────────────────────────────────────────────────────────────────────────────

const baselineSql = canonicalSql(readBaseline());

/** The body of a policy, from its `create policy` to the `;` which closes it. */
function policyBody(sql: string, name: string): string {
  const start = sql.indexOf(`create policy ${name} `);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf(";", start);
  return sql.slice(start, end);
}

describe("policies (SQL)", () => {
  it.each(["comments_update", "comments_delete"])(
    "%s exige l'appartenance au projet du parent, pas seulement l'auteur",
    (name) => {
      const body = policyBody(baselineSql, name);
      expect(body).toMatch(/author_id = \( select auth\.uid\(\)(?: as uid)?\)/);
      expect(body).toContain("public.can_access_comment_parent(");
    },
  );

  it.each(["comments_insert", "page_comments_insert"])(
    "%s épingle via_assistant et via_mcp à false",
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
  ])("%s ne caste plus le topic à cru", (name) => {
    const body = policyBody(baselineSql, name);
    // A malformed topic would return NULL instead of RAISING — and a branch that
    // raise drops the entire policy, therefore all the real time of the session.
    expect(body).toContain("public.can_access_project(public.topic_uuid(realtime.topic()))");
    expect(body).not.toMatch(/split_part\(realtime\.topic\(\), ':', 2\)::uuid/);
  });

  it("topic_uuid rend NULL au lieu de lever", () => {
    const sql = baselineSql;
    expect(sql).toContain("exception when others then return null;");
    // Called from a policy: without `execute`, the call raises and the policy
    // falls with him (MIN-329).
    expect(sql).toMatch(/grant (?:execute|all) on function public\.topic_uuid\((?:topic )?text\) to authenticated/);
  });
});
