import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountTransferDocument } from "@/lib/account-transfer";

vi.mock("server-only", () => ({}));

interface Row extends Record<string, unknown> {}

const database = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; rows: Row[] }>,
}));

function makeQuery(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let writeRows: Row[] | null = null;

  const matching = () =>
    (database.rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
  const run = () => {
    if (writeRows) {
      database.writes.push({ table, rows: writeRows });
      return { data: writeRows, error: null };
    }
    return { data: matching(), error: null };
  };

  const query: Record<string, unknown> = {};
  Object.assign(query, {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    upsert: (rows: Row | Row[]) => {
      writeRows = Array.isArray(rows) ? rows : [rows];
      return query;
    },
    update: (row: Row) => {
      writeRows = [row];
      return query;
    },
    maybeSingle: async () => {
      const result = run();
      return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: null };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  });
  return query;
}

const service = {
  from: (table: string) => makeQuery(table),
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: () => ({ data: { publicUrl: "https://example.test/icon" } }),
    }),
  },
  auth: {
    admin: {
      getUserById: async () => ({ data: { user: { user_metadata: {} } } }),
      updateUserById: async () => ({ error: null }),
    },
  },
};

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => service }));

const { AccountImportScopeError, importAccountTransfer } = await import("./account-import");

const USER = "11111111-1111-4111-8111-111111111111";
const SOURCE_USER = "22222222-2222-4222-8222-222222222222";
const OWNED_PROJECT = "33333333-3333-4333-8333-333333333333";
const OTHER_PROJECT = "44444444-4444-4444-8444-444444444444";
const OTHER_OWNER = "55555555-5555-4555-8555-555555555555";
const ISSUE = "66666666-6666-4666-8666-666666666666";
const OBJECTIVE = "77777777-7777-4777-8777-777777777777";

function transfer(overrides: Partial<AccountTransferDocument> = {}): AccountTransferDocument {
  return {
    format_version: 3,
    exported_at: "2026-08-25T12:00:00.000Z",
    account: { id: SOURCE_USER },
    preferences: null,
    owned_projects: [],
    memberships: [],
    issues: [],
    comments: [],
    attachments: [],
    page_files: [],
    pages: [],
    objectives: [],
    categories: [],
    issue_categories: [],
    views: [],
    cycles: [],
    scratchpad: null,
    assistant_conversations: [],
    code_agent_conversations: [],
    notifications: [],
    push_devices: [],
    statistics: [],
    billing: null,
    ai_usage: [],
    api_keys: [],
    connected_apps: [],
    git_connections: [],
    git_user_identities: [],
    model_keys: [],
    ...overrides,
  };
}

beforeEach(() => {
  database.rows = {};
  database.writes.length = 0;
});

describe("account import tenant isolation", () => {
  it("rejects a membership that references another tenant's project", async () => {
    database.rows.projects = [{ id: OTHER_PROJECT, owner_id: OTHER_OWNER }];

    await expect(
      importAccountTransfer(
        transfer({ memberships: [{ project_id: OTHER_PROJECT, role: "member" }] }),
        USER,
      ),
    ).rejects.toBeInstanceOf(AccountImportScopeError);
    expect(database.writes).toEqual([]);
  });

  it("performs no writes when a mixed payload contains a foreign reference", async () => {
    database.rows.projects = [{ id: OTHER_PROJECT, owner_id: OTHER_OWNER }];

    await expect(
      importAccountTransfer(
        transfer({
          owned_projects: [{ id: OWNED_PROJECT, key: "OWN", name: "Owned" }],
          memberships: [{ project_id: OTHER_PROJECT, role: "member" }],
        }),
        USER,
      ),
    ).rejects.toBeInstanceOf(AccountImportScopeError);
    expect(database.writes).toEqual([]);
  });

  it("rejects an imported data ID that is already bound to another project", async () => {
    database.rows.projects = [{ id: OWNED_PROJECT, owner_id: USER, key: "OWN" }];
    database.rows.issues = [
      { id: ISSUE, project_id: OTHER_PROJECT, created_by: OTHER_OWNER },
    ];

    await expect(
      importAccountTransfer(
        transfer({
          owned_projects: [{ id: OWNED_PROJECT, key: "OWN", name: "Owned" }],
          issues: [
            {
              id: ISSUE,
              project_id: OWNED_PROJECT,
              number: 1,
              title: "Imported issue",
              created_by: SOURCE_USER,
            },
          ],
        }),
        USER,
      ),
    ).rejects.toBeInstanceOf(AccountImportScopeError);
    expect(database.writes).toEqual([]);
  });

  it("rejects a cross-project reference before importing an otherwise owned graph", async () => {
    await expect(
      importAccountTransfer(
        transfer({
          owned_projects: [
            { id: OWNED_PROJECT, key: "OWN", name: "Owned" },
            { id: OTHER_PROJECT, key: "OTH", name: "Other" },
          ],
          objectives: [
            { id: OBJECTIVE, project_id: OTHER_PROJECT, name: "Foreign objective" },
          ],
          issues: [
            {
              id: ISSUE,
              project_id: OWNED_PROJECT,
              objective_id: OBJECTIVE,
              number: 1,
              title: "Imported issue",
              created_by: SOURCE_USER,
            },
          ],
        }),
        USER,
      ),
    ).rejects.toBeInstanceOf(AccountImportScopeError);
    expect(database.writes).toEqual([]);
  });

  it("accepts an existing same-tenant membership without changing its role", async () => {
    database.rows.projects = [{ id: OTHER_PROJECT, owner_id: OTHER_OWNER }];
    database.rows.project_members = [
      { project_id: OTHER_PROJECT, user_id: USER, role: "member" },
    ];

    const result = await importAccountTransfer(
      transfer({ memberships: [{ project_id: OTHER_PROJECT, role: "owner" }] }),
      USER,
    );

    expect(result.membershipsRestored).toBe(1);
    expect(result.skippedMemberships).toBe(0);
    expect(database.writes).toEqual([]);
    expect(database.rows.project_members[0]?.role).toBe("member");
  });

  it("imports project data when every identifier belongs to the account", async () => {
    database.rows.projects = [{ id: OWNED_PROJECT, owner_id: USER, key: "OLD" }];

    const result = await importAccountTransfer(
      transfer({
        owned_projects: [{ id: OWNED_PROJECT, key: "NEW", name: "Owned" }],
        issues: [
          {
            id: ISSUE,
            project_id: OWNED_PROJECT,
            number: 1,
            title: "Imported issue",
            created_by: SOURCE_USER,
          },
        ],
      }),
      USER,
    );

    expect(result.projects).toBe(1);
    expect(result.issues).toBe(1);
    expect(database.writes.map((write) => write.table)).toEqual(["projects", "issues"]);
  });
});
