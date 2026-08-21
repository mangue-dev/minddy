import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Repository RENAME reconciliation. A forge rename keeps the repository id
 * but kills the stored `owner/name`: without this repair, scoped token mints
 * 422, sweeps stop, and PRs ingested under the new name turn invisible.
 *
 * Covered here: the no-op paths, the plain migration (rows change name,
 * stale sweep stamp dies, link carries the new owner/name), the collapse of
 * duplicate rows when post-rename webhooks already created new-name twins
 * (the ticket attachment survives), and the mirror push for RELAYED links.
 */

interface Row {
  [key: string]: unknown;
}

type TableName = "project_git_links" | "pull_requests" | "pull_request_syncs";

const db: Record<TableName, Row[]> = {
  project_git_links: [],
  pull_requests: [],
  pull_request_syncs: [],
};

const relayPushes: unknown[] = [];
let relayConfigured = false;

vi.mock("@/lib/server/forge-relay/client", () => ({
  isForgeRelayClientConfigured: () => relayConfigured,
}));
vi.mock("@/lib/server/forge-relay/link-push", () => ({
  pushRelayLinkEvent: async (event: unknown) => {
    relayPushes.push(event);
  },
}));

/** Minimal chainable PostgREST stand-in: enough for select/update/delete. */
function makeChain(name: TableName) {
  const filters: Array<{ col: string; op: "eq" | "in"; value: unknown }> = [];
  const matches = (row: Row) =>
    filters.every(({ col, op, value }) =>
      op === "in" ? (value as unknown[]).includes(row[col]) : row[col] === value,
    );
  type Chain = {
    select: () => Chain;
    in: (col: string, values: unknown[]) => Chain;
    eq: (col: string, value: unknown) => Chain;
    update: (values: Row) => {
      eq: (col: string, value: unknown) => { then: (r: (x: { error: null }) => unknown) => unknown };
    };
    delete: () => Chain;
    then: (r: (x: { data?: Row[] | null; error: null }) => unknown) => unknown;
  };
  const chain: Chain = {
    select: () => chain,
    in: (col, values) => (filters.push({ col, op: "in", value: values }), chain),
    eq: (col, value) => (filters.push({ col, op: "eq", value }), chain),
    update: (values) => ({
      eq: (col, value) => ({
        then: (resolve) => {
          const row = db[name].find((r) => r[col] === value);
          if (row) Object.assign(row, values);
          return resolve({ error: null });
        },
      }),
    }),
    delete: () => {
      const deleter = {
        eq: (col: string, value: unknown) => {
          filters.push({ col, op: "eq", value });
          (deleter as unknown as Chain).then = (resolve) => {
            db[name] = db[name].filter((row) => !matches(row));
            return resolve({ error: null });
          };
          return deleter as unknown as Chain;
        },
      } as Record<string, unknown> as Chain;
      return deleter;
    },
    then: (resolve) =>
      resolve({ data: db[name].filter(matches), error: null }),
  };
  return chain;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => makeChain(name as TableName),
  }),
}));

const { reconcileRepoRename } = await import("@/lib/server/git/repo-rename");

beforeEach(() => {
  db.project_git_links = [
    {
      id: "link-1",
      connection_id: "conn-1",
      provider: "github",
      external_repo_id: "1288848861",
      repo_full_name: "mangue-dev/minddy-issues",
      repo_owner: "mangue-dev",
      repo_name: "minddy-issues",
      git_connections: { source: "local" },
    },
  ];
  db.pull_requests = [];
  db.pull_request_syncs = [];
  relayPushes.length = 0;
  relayConfigured = false;
});

describe("reconcileRepoRename", () => {
  it("does nothing without an id or a name", async () => {
    expect(
      await reconcileRepoRename({ provider: "github", externalRepoId: null, fullName: "o/r" }),
    ).toEqual({ renamed: false });
    expect(
      await reconcileRepoRename({ provider: "github", externalRepoId: "1", fullName: null }),
    ).toEqual({ renamed: false });
  });

  it("does nothing when every link already carries the current name", async () => {
    db.project_git_links[0].repo_full_name = "mangue-dev/minddy";
    expect(
      await reconcileRepoRename({
        provider: "github",
        externalRepoId: "1288848861",
        fullName: "mangue-dev/minddy",
      }),
    ).toEqual({ renamed: false });
    expect(relayPushes).toHaveLength(0);
  });

  it("renames the link and its PR rows, and drops the stale sweep stamp", async () => {
    db.pull_requests = [
      { id: "pr-a", number: 87, issue_id: "issue-1", repo_full_name: "mangue-dev/minddy-issues", provider: "github" },
      { id: "pr-b", number: 86, issue_id: null, repo_full_name: "mangue-dev/minddy-issues", provider: "github" },
    ];
    db.pull_request_syncs = [
      { provider: "github", repo_full_name: "mangue-dev/minddy-issues", synced_at: "2026-08-21T10:00:00Z" },
    ];

    const result = await reconcileRepoRename({
      provider: "github",
      externalRepoId: "1288848861",
      fullName: "mangue-dev/minddy",
    });

    expect(result).toEqual({ renamed: true });
    expect(db.project_git_links[0]).toMatchObject({
      repo_full_name: "mangue-dev/minddy",
      repo_owner: "mangue-dev",
      repo_name: "minddy",
    });
    expect(db.pull_requests.map((r) => r.repo_full_name)).toEqual([
      "mangue-dev/minddy",
      "mangue-dev/minddy",
    ]);
    expect(db.pull_request_syncs).toHaveLength(0);
    expect(relayPushes).toHaveLength(0); // local connection: no mirror
  });

  it("collapses new-name twins into their fresh row, carrying the ticket link over", async () => {
    db.pull_requests = [
      // Old name: history plus the ticket attachment.
      { id: "old", number: 80, issue_id: "issue-9", repo_full_name: "mangue-dev/minddy-issues", provider: "github" },
      // Twin born from a post-rename webhook: fresh, unattached.
      { id: "twin", number: 80, issue_id: null, repo_full_name: "mangue-dev/minddy", provider: "github" },
      // Old-name row WITHOUT a twin: plain rename.
      { id: "lone", number: 79, issue_id: null, repo_full_name: "mangue-dev/minddy-issues", provider: "github" },
    ];

    const result = await reconcileRepoRename({
      provider: "github",
      externalRepoId: "1288848861",
      fullName: "mangue-dev/minddy",
    });

    expect(result).toEqual({ renamed: true });
    expect(db.pull_requests.map((r) => r.number).sort()).toEqual([79, 80]); // no duplicate #80
    expect(db.pull_requests.find((r) => r.number === 80)).toMatchObject({
      id: "twin",
      issue_id: "issue-9", // attachment migrated from the dead row
    });
    expect(db.pull_requests.find((r) => r.number === 79)).toMatchObject({
      repo_full_name: "mangue-dev/minddy",
    });
  });

  it("announces the new name to the relay mirror for a RELAYED link", async () => {
    relayConfigured = true;
    db.project_git_links[0] = {
      ...db.project_git_links[0],
      provider: "gitlab",
      external_repo_id: "42",
      git_connections: { source: "relay" },
    };

    await reconcileRepoRename({
      provider: "gitlab",
      externalRepoId: "42",
      fullName: "group/sub/app",
    });

    expect(db.project_git_links[0]).toMatchObject({
      repo_full_name: "group/sub/app",
      repo_owner: "group/sub",
      repo_name: "app",
    });
    expect(relayPushes).toHaveLength(1);
    expect(relayPushes[0]).toMatchObject({ event: "linked", repo: "group/sub/app" });
  });
});
