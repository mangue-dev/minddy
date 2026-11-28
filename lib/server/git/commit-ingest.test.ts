import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PushCommit } from "./push-core";

/**
 * MIN-1037: what a push does to the issues it names. The pure rules (which
 * references a message carries, which status the work implies) have their own
 * tests; this one holds the decisions of the ingestion: which commits speak
 * for themselves, which belong to a pull request, and what is only said once.
 */

interface Call {
  table: string;
  method: string;
  args: unknown[];
}

const state = vi.hoisted(() => ({
  links: [] as Array<{ created_by: string | null; project: { id: string; key: string; deleted_at: string | null } }>,
  issues: [] as Array<{ id: string; number: number; project_id: string }>,
  livePullRequests: [] as Array<{ id: string; head_branch: string }>,
  mergedPullRequests: [] as Array<{ id: string; merge_commit_shas: string[] }>,
  branches: [] as Array<{ id: string; issue_id: string; branch: string; head_sha: string | null }>,
  /** (issue, sha) pairs already stored, with the pull request that carries them. */
  known: new Map<string, { id: string; onDefaultBranch: boolean; pullRequestId: string | null }>(),
  upserts: [] as Array<Record<string, unknown>>,
  calls: [] as Call[],
  compared: [] as unknown[],
  /** forge login → member of the project who connected that account. */
  memberLogins: {} as Record<string, string>,
  /** issue ↔ pull request links. */
  linked: [] as Array<{ issue_id: string; pull_request: Record<string, unknown> }>,
  /** sha → numbers of the pull requests the forge says it came through. */
  forgePullRequests: {} as Record<string, number[]>,
  /** Makes the branch read fail, as a transient database error would. */
  failBranches: false,
  /** Rows marked as announced, by id. */
  announcedIds: [] as string[],
  removedLines: [] as unknown[],
}));

/** A pull request of the pushed repository, linked to an issue. */
function link(issueId: string, id: string, number: number, stateOf = "open") {
  return {
    issue_id: issueId,
    pull_request: { id, provider: "gitlab", repo_full_name: "group/app", number, state: stateOf },
  };
}

/** A chainable stand-in for one table: filters are recorded, rows come from `state`. */
function table(name: string) {
  const filters: Record<string, unknown> = {};
  let action: "select" | "insert" | "update" | "delete" = "select";
  let values: Record<string, unknown> | null = null;
  const run = () => {
    if (name === "project_git_links") return { data: state.links, error: null };
    if (name === "issues") {
      const numbers = (filters.number as number[] | undefined) ?? [];
      return {
        data: state.issues.filter((issue) =>
          issue.project_id === filters.project_id && numbers.includes(issue.number)),
        error: null,
      };
    }
    if (name === "pull_requests") {
      return {
        data: "merge_commit_shas" in filters
          ? state.mergedPullRequests.filter((pr) =>
              pr.merge_commit_shas.some((sha) => (filters.merge_commit_shas as string[]).includes(sha)))
          : state.livePullRequests,
        error: null,
      };
    }
    if (name === "pull_request_issues") return { data: state.linked, error: null };
    if (name === "issue_commits") {
      if (action === "update" && values && "announced_at" in values) {
        state.announcedIds.push(...(filters.id as string[]));
      }
      return { data: [], error: null };
    }
    if (name === "issue_branches") {
      if (state.failBranches) return { data: [], error: { code: "08006" } };
      if (action === "insert" && values) {
        state.branches.push(values as (typeof state.branches)[number]);
      } else if (action === "update" && values) {
        for (const row of state.branches) if (row.id === filters.id) Object.assign(row, values);
      } else if (action === "delete") {
        state.branches = state.branches.filter(
          (row) => !(filters.id as string[]).includes(row.id));
      }
      return {
        data: state.branches.filter((row) => row.issue_id === filters.issue_id),
        error: null,
      };
    }
    return { data: [], error: null };
  };
  const query: Record<string, unknown> = {};
  const chain = (method: string) => (...args: unknown[]) => {
    state.calls.push({ table: name, method, args });
    if (method === "insert" || method === "update" || method === "delete") {
      action = method;
      values = (args[0] as Record<string, unknown>) ?? null;
    } else if (["eq", "in", "overlaps"].includes(method)) {
      filters[args[0] as string] = args[1];
    }
    return query;
  };
  for (const method of ["select", "insert", "update", "delete", "eq", "in", "is", "overlaps", "order", "limit"]) {
    query[method] = chain(method);
  }
  query.maybeSingle = async () => ({ data: run().data[0] ?? null, error: null });
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve);
  return query;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: (name: string) => table(name),
    rpc: async (_name: string, { p_values }: { p_values: Record<string, unknown> }) => {
      state.upserts.push(p_values);
      const key = `${p_values.issue_id}:${p_values.sha}`;
      const known = state.known.get(key);
      const pullRequestId = known?.pullRequestId ?? (p_values.pull_request_id as string | null);
      const onDefaultBranch = (known?.onDefaultBranch ?? false) || p_values.on_default_branch === true;
      const id = known?.id ?? (p_values.id as string);
      state.known.set(key, { id, onDefaultBranch, pullRequestId });
      return {
        data: {
          id,
          inserted: !known,
          promoted: !!known && !known.onDefaultBranch && onDefaultBranch,
          announced: state.announcedIds.includes(id),
          pull_request_id: pullRequestId,
        },
        error: null,
      };
    },
  }),
}));
vi.mock("@/lib/server/issue-store", () => ({ issueStore: () => table("issues") }));
vi.mock("./commit-content", () => ({
  shouldEncryptCodeWorkContent: async () => false,
  encodeCodeWorkRow: async (_table: string, row: unknown) => row,
  decodeCodeWorkRow: async (_table: string, row: unknown) => row,
}));
vi.mock("./repository-name-content", () => ({
  repositoryStorageName: async (_provider: string, name: string) => name,
}));
vi.mock("./gitlab-app", () => ({ alignGitlabWebhook: vi.fn(async () => {}) }));
vi.mock("./forge-members", () => ({
  buildForgeAssigneeIndex: async () => new Map(Object.entries(state.memberLogins)),
}));
vi.mock("@/lib/server/agent/pull-request-content", () => ({
  decodePullRequestContentRow: async (row: unknown) => row,
}));
vi.mock("@/lib/server/agent/pull-requests", () => ({ pullRequestIssueIds: async () => [] }));
vi.mock("@/lib/server/issue-event-store", () => ({
  removeForgeIssueEvents: vi.fn(async (_service: unknown, options: unknown) => {
    state.removedLines.push(options);
  }),
}));
vi.mock("@/lib/server/agent/repo-access", () => ({
  resolveLinkedRepository: async () => ({
    provider: "gitlab", repoFullName: "group/app", externalRepoId: "77", token: "token",
  }),
}));
vi.mock("@/lib/server/agent/forge", () => ({
  isForgeApiError: () => false,
  forgeFor: () => ({
    listCommitPullRequestNumbers: async ({ sha }: { sha: string }) =>
      state.forgePullRequests[sha] ?? [],
    compareCommits: async (opts: unknown) => {
      state.compared.push(opts);
      return {
        truncated: false,
        commits: [
          { sha: "c1", message: "noise", author: null, authorName: "Alex", authoredAt: null },
          { sha: "c21", message: "Closes MIN-2", author: null, authorName: "Alex", authoredAt: null },
        ],
      };
    },
  }),
}));
const insertEvents = vi.hoisted(() => vi.fn(async (_service: unknown, _rows: unknown[]) => {}));
vi.mock("@/lib/server/issue-events", () => ({ insertEvents }));
const syncStatus = vi.hoisted(() => vi.fn(async (_opts: unknown) => {}));
vi.mock("@/lib/server/agent/issue-status-sync", () => ({
  syncIssueStatusFromForgeWork: syncStatus,
}));

const { ingestPush } = await import("./commit-ingest");

function commit(sha: string, message: string): PushCommit {
  return {
    sha, message, authorLogin: "camille", authorAvatarUrl: null, authorName: "Camille Roy",
    authorEmail: "camille@example.test", committedAt: "2026-11-28T10:00:00Z",
  };
}

function push(overrides: Partial<Parameters<typeof ingestPush>[0]> = {}) {
  return {
    provider: "gitlab" as const,
    repoFullName: "group/app",
    externalRepoId: "77",
    branch: "feature/board",
    before: "aaa",
    after: "bbb",
    created: false,
    deleted: false,
    forced: false,
    defaultBranch: "main",
    onDefaultBranch: false,
    commits: [commit("s1", "MIN-1 first pass")],
    truncated: false,
    pusher: { accountId: "12", login: "camille", avatarUrl: null },
    ...overrides,
  };
}

const events = () => insertEvents.mock.calls.flatMap(([, rows]) => rows as Array<Record<string, unknown>>);
const signals = () => syncStatus.mock.calls.map(([opts]) => opts as Record<string, unknown>);

beforeEach(() => {
  state.links = [{ created_by: "linker", project: { id: "p1", key: "MIN", deleted_at: null } }];
  state.issues = [
    { id: "issue-1", number: 1, project_id: "p1" },
    { id: "issue-2", number: 2, project_id: "p1" },
  ];
  state.livePullRequests = [];
  state.mergedPullRequests = [];
  state.branches = [];
  state.known = new Map();
  state.upserts = [];
  state.calls = [];
  state.compared = [];
  state.memberLogins = {};
  state.linked = [];
  state.forgePullRequests = {};
  state.failBranches = false;
  state.announcedIds = [];
  state.removedLines = [];
  insertEvents.mockClear();
  syncStatus.mockClear();
});

describe("ingestPush", () => {
  it("stores a commit that names an issue, records one line and starts the issue", async () => {
    await ingestPush(push({
      commits: [commit("s1", "MIN-1 first pass"), commit("s2", "MIN-1 second pass"), commit("s3", "unrelated")],
    }));
    expect(state.upserts.map((row) => [row.sha, row.issue_id, row.title, row.pull_request_id]))
      .toEqual([["s1", "issue-1", "MIN-1 first pass", null], ["s2", "issue-1", "MIN-1 second pass", null]]);
    expect(events()).toEqual([expect.objectContaining({
      issue_id: "issue-1", actor_id: null, type: "commits_pushed",
      from_value: "gitlab:camille", to_value: "2",
    })]);
    expect(signals()).toEqual([{
      issueId: "issue-1", actorId: "linker", forgeSync: "gitlab",
      signal: { kind: "commits", closesOnDefaultBranch: false },
    }]);
  });

  it("credits the push to the member of the project who connected that forge account", async () => {
    state.memberLogins = { camille: "user-camille" };
    await ingestPush(push());
    expect(events()).toEqual([expect.objectContaining({
      actor_id: "user-camille", type: "commits_pushed", to_value: "1",
    })]);
  });

  it("keeps the co-signers of a commit, without its author", async () => {
    await ingestPush(push({
      provider: "github",
      commits: [commit("s1", [
        "MIN-1 first pass",
        "",
        "Co-authored-by: Camille Roy <camille@example.test>",
        "Co-Authored-By: Alex Martin <12345+alex-m@users.noreply.github.com>",
        "Co-authored-by: Claude <claude@example.test>",
      ].join("\n"))],
    }));
    expect(JSON.parse(state.upserts[0].co_authors as string)).toEqual([
      { name: "Alex Martin", login: "alex-m" },
      { name: "Claude", login: null },
    ]);
    await ingestPush(push({ commits: [commit("s2", "MIN-1 alone")] }));
    expect(state.upserts[1].co_authors).toBeNull();
  });

  it("completes an issue only when the closing commit is on the default branch", async () => {
    await ingestPush(push({ commits: [commit("s1", "Fixes MIN-1")] }));
    expect(signals()[0].signal).toEqual({ kind: "commits", closesOnDefaultBranch: false });
    syncStatus.mockClear();
    await ingestPush(push({
      branch: "main", onDefaultBranch: true, commits: [commit("s9", "Fixes MIN-2")],
    }));
    expect(signals()[0]).toMatchObject({
      issueId: "issue-2", signal: { kind: "commits", closesOnDefaultBranch: true },
    });
  });

  it("attaches several issues to one commit", async () => {
    await ingestPush(push({ commits: [commit("s1", "Fixes MIN-1, see MIN-2")] }));
    expect(state.upserts.map((row) => [row.issue_id, row.closes]))
      .toEqual([["issue-1", true], ["issue-2", false]]);
    expect(signals().map((signal) => signal.issueId)).toEqual(["issue-1", "issue-2"]);
  });

  it("leaves the commits of a live pull request to that pull request", async () => {
    state.livePullRequests = [{ id: "pr-7", head_branch: "feature/board" }];
    state.linked = [link("issue-1", "pr-7", 7)];
    await ingestPush(push());
    expect(state.upserts[0].pull_request_id).toBe("pr-7");
    expect(events()).toEqual([]);
    expect(signals()).toEqual([]);
  });

  it("keeps for its issue a commit pushed on the branch of a pull request linked to another", async () => {
    state.livePullRequests = [{ id: "pr-7", head_branch: "feature/board" }];
    state.linked = [link("issue-1", "pr-7", 7)];
    await ingestPush(push({ commits: [commit("s1", "MIN-1 pass, fixes MIN-2")] }));
    expect(state.upserts.map((row) => [row.issue_id, row.pull_request_id]))
      .toEqual([["issue-1", "pr-7"], ["issue-2", null]]);
    expect(events().map((event) => event.issue_id)).toEqual(["issue-2"]);
    expect(signals().map((signal) => signal.issueId)).toEqual(["issue-2"]);
  });

  it("gives a merged pull request the commits its merge brought to the default branch", async () => {
    state.linked = [link("issue-1", "pr-7", 7, "merged")];
    state.forgePullRequests = { s1: [7], s2: [7] };
    await ingestPush(push({
      branch: "main", onDefaultBranch: true,
      commits: [commit("s1", "MIN-1 first pass"), commit("s2", "MIN-1 second pass, see MIN-2")],
    }));
    expect(state.upserts.map((row) => [row.sha, row.issue_id, row.pull_request_id])).toEqual([
      ["s1", "issue-1", "pr-7"], ["s2", "issue-1", "pr-7"], ["s2", "issue-2", null],
    ]);
    expect(events().map((event) => event.issue_id)).toEqual(["issue-2"]);
  });

  it("hands over a merge commit recorded while its push was being stored", async () => {
    state.linked = [link("issue-1", "pr-7", 7, "merged")];
    // The merge is recorded after the first lookup: it only shows once the
    // rows and the line are written.
    insertEvents.mockImplementationOnce(async () => {
      state.mergedPullRequests = [{ id: "pr-7", merge_commit_shas: ["s1"] }];
    });
    await ingestPush(push({
      branch: "main", onDefaultBranch: true, commits: [commit("s1", "Fixes MIN-1 (#7)")],
    }));
    expect(state.upserts[0].pull_request_id).toBeNull();
    expect(state.removedLines).toEqual([expect.objectContaining({
      issueIds: ["issue-1"], type: "commits_pushed",
    })]);
    expect(signals()).toEqual([]);
  });

  it("still asks for the status when a step after the commits fails, and speaks once", async () => {
    state.failBranches = true;
    const named = push({ branch: "min-1-board" });
    await ingestPush(named);
    expect(signals()).toEqual([expect.objectContaining({
      issueId: "issue-1", signal: { kind: "commits", closesOnDefaultBranch: false },
    })]);
    expect(events()).toHaveLength(1);
    expect(state.announcedIds).toHaveLength(1);
  });

  it("speaks for a stored commit that no push announced", async () => {
    syncStatus.mockRejectedValueOnce(new Error("interrupted"));
    await expect(ingestPush(push())).rejects.toThrow();
    expect(state.announcedIds).toEqual([]);
    insertEvents.mockClear();
    syncStatus.mockClear();
    await ingestPush(push());
    expect(events()).toHaveLength(1);
    expect(signals()).toHaveLength(1);
  });

  it("gives the commit a merge produced back to its pull request", async () => {
    state.mergedPullRequests = [{ id: "pr-7", merge_commit_shas: ["s1"] }];
    state.linked = [link("issue-1", "pr-7", 7, "merged")];
    await ingestPush(push({ branch: "main", onDefaultBranch: true, commits: [commit("s1", "Fixes MIN-1 (#7)")] }));
    expect(state.upserts[0].pull_request_id).toBe("pr-7");
    expect(events()).toEqual([]);
    expect(signals()).toEqual([]);
  });

  it("says nothing more about a commit it has already seen", async () => {
    await ingestPush(push());
    insertEvents.mockClear();
    syncStatus.mockClear();
    await ingestPush(push());
    expect(events()).toEqual([]);
    expect(signals()).toEqual([]);
  });

  it("signals again, without a new line, when a branch commit reaches the default branch", async () => {
    await ingestPush(push({ commits: [commit("s1", "Fixes MIN-1")] }));
    insertEvents.mockClear();
    syncStatus.mockClear();
    await ingestPush(push({
      branch: "main", onDefaultBranch: true, commits: [commit("s1", "Fixes MIN-1")],
    }));
    expect(events()).toEqual([]);
    expect(signals()[0].signal).toEqual({ kind: "commits", closesOnDefaultBranch: true });
  });

  it("starts an issue on a branch named after it, once per move of the branch", async () => {
    const named = push({ branch: "min-2-keyboard", commits: [], before: null, created: true });
    await ingestPush(named);
    expect(state.branches).toEqual([expect.objectContaining({
      issue_id: "issue-2", branch: "min-2-keyboard", head_sha: "bbb",
    })]);
    expect(signals()).toEqual([expect.objectContaining({
      issueId: "issue-2", signal: { kind: "branch" },
    })]);
    syncStatus.mockClear();
    await ingestPush(named);
    expect(state.branches).toHaveLength(1);
    expect(signals()).toEqual([]);
  });

  it("forgets a deleted branch and does not show one a pull request carries", async () => {
    await ingestPush(push({ branch: "min-2-keyboard", commits: [] }));
    await ingestPush(push({ branch: "min-2-keyboard", commits: [], after: null, deleted: true }));
    expect(state.branches).toEqual([]);
    state.livePullRequests = [{ id: "pr-7", head_branch: "min-2-keyboard" }];
    await ingestPush(push({ branch: "min-2-keyboard", commits: [] }));
    expect(state.branches).toEqual([]);
  });

  it("reads the rest of a truncated push from the forge", async () => {
    await ingestPush(push({
      branch: "main", onDefaultBranch: true, truncated: true, commits: [commit("c1", "noise")],
    }));
    expect(state.compared).toEqual([expect.objectContaining({ base: "aaa", head: "bbb" })]);
    expect(state.upserts.map((row) => [row.sha, row.issue_id, row.closes]))
      .toEqual([["c21", "issue-2", true]]);
  });

  it("reads nothing more for a push that names no issue, a tag or an unlinked repository", async () => {
    await ingestPush(push({ commits: [commit("s1", "ACME-1 and ADMIN-1")] }));
    await ingestPush(push({ branch: null }));
    state.links = [];
    await ingestPush(push());
    expect(state.upserts).toEqual([]);
    expect(state.calls.filter((call) => call.table !== "project_git_links")).toEqual([]);
    expect(signals()).toEqual([]);
  });

  it("does not write a status when nobody linked the repository", async () => {
    state.links = [{ created_by: null, project: { id: "p1", key: "MIN", deleted_at: null } }];
    await ingestPush(push());
    expect(state.upserts).toHaveLength(1);
    expect(signals()).toEqual([]);
  });
});
