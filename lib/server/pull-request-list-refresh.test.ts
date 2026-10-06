import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ runs: [] as unknown[], opened: [] as unknown[], identities: vi.fn(), queue: vi.fn(), list: vi.fn(), syncs: vi.fn(), sweep: vi.fn(), repos: vi.fn() }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ createRepositoryNameDecoder: () => async (_provider: string, name: string) => name }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => {
  return { ok: true, user: { id: "owner" }, supabase: { from: (table: string) => {
    const query = { select: () => query, in: () => query, order: () => query, eq: () => query,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "agent_runs" ? mocks.runs : mocks.opened }).then(resolve) };
    return query;
  } } };
} }));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequest: vi.fn(), loadPullRequestIssues: vi.fn(), resolvePrForRun: vi.fn(),
  listPullRequestsForUser: mocks.list, readRepoSyncStates: mocks.syncs,
  listVisibleRepos: mocks.repos,
  needsRepoSync: (state: { synced_at: string } | undefined) => !state || state.synced_at === "old",
  repoSyncKey: (provider: string, name: string) => `${provider}:${name}`,
  rowProvider: () => "github",
}));
vi.mock("@/lib/server/agent/pull-requests-sweep", () => ({ sweepRepo: mocks.sweep }));
vi.mock("@/lib/server/git/user-identities", () => ({ listUserIdentities: mocks.identities }));
vi.mock("@/lib/server/agent/pull-request-review-queue", () => ({ readReviewQueue: mocks.queue }));
vi.mock("@/lib/server/agent/runs", () => ({ getRun: vi.fn() }));

import { GET } from "@/app/api/pull-requests/route";
const row = { id: "new-pr", number: 1, repo_full_name: "acme/app", provider: "github",
  state: "open", title: "New PR", issue: null, issues: [], updated_at: "2026-10-04T12:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.runs = []; mocks.opened = [];
  mocks.identities.mockResolvedValue([]);
  mocks.queue.mockResolvedValue(new Map());
  mocks.repos.mockResolvedValue([{ provider: "github", repoFullName: "acme/app",
    project: { id: "project", key: "ACME", name: "Acme" } }]);
});

it("returns a newly discovered PR in the same response after catching up a stale repository", async () => {
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "old" }]]));
  mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
  let release!: (truncated: boolean) => void;
  mocks.sweep.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
  let settled = false;
  const response = GET(new NextRequest("http://localhost/api/pull-requests"));
  void response.then(() => { settled = true; });
  await vi.waitFor(() => expect(mocks.sweep).toHaveBeenCalledOnce());
  expect(settled).toBe(false);
  release(false);
  const body = await (await response).json();
  expect(body.pullRequests.map((pr: { prId: string }) => pr.prId)).toEqual(["new-pr"]);
  expect(mocks.list).toHaveBeenCalledTimes(2);
});

it("avoids another forge scan and database reread inside the discovery TTL", async () => {
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue([row]);
  await GET(new NextRequest("http://localhost/api/pull-requests"));
  expect(mocks.sweep).not.toHaveBeenCalled();
  expect(mocks.list).toHaveBeenCalledOnce();
});

it("catches up distinct stale repositories with at most three concurrent scans before rereading", async () => {
  const repos = Array.from({ length: 7 }, (_, index) => ({ provider: "github",
    repoFullName: `acme/app-${index}`, project: { id: "project", key: "ACME", name: "Acme" } }));
  mocks.repos.mockResolvedValue([...repos, repos[0]]);
  mocks.syncs.mockResolvedValue(new Map());
  mocks.list.mockResolvedValueOnce([]).mockResolvedValueOnce([row]);
  const releases: (() => void)[] = [];
  let active = 0;
  let maximum = 0;
  mocks.sweep.mockImplementation((_userId, repo) => new Promise<boolean>((resolve) => {
    active++;
    maximum = Math.max(maximum, active);
    releases.push(() => { active--; resolve(repo.repoFullName === "acme/app-3"); });
  }));
  const response = GET(new NextRequest("http://localhost/api/pull-requests"));
  await vi.waitFor(() => expect(mocks.sweep).toHaveBeenCalledTimes(3));
  expect(mocks.list).toHaveBeenCalledOnce();
  releases[0]();
  await vi.waitFor(() => expect(mocks.sweep).toHaveBeenCalledTimes(4));
  expect(active).toBe(3);
  releases[1](); releases[2](); releases[3]();
  await vi.waitFor(() => expect(mocks.sweep).toHaveBeenCalledTimes(7));
  expect(mocks.list).toHaveBeenCalledOnce();
  releases[4](); releases[5](); releases[6]();
  expect((await (await response).json()).truncated).toBe(true);
  expect(mocks.list).toHaveBeenCalledTimes(2);
  expect(maximum).toBe(3);
  expect(mocks.sweep.mock.calls.map(([, repo]) => repo.repoFullName)).toEqual(repos.map((repo) => repo.repoFullName));
});


it("matches ownership and pending review requests against the personal forge identity", async () => {
  mocks.identities.mockResolvedValue([{ provider: "github", account_login: "Ada" }]);
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue([{ ...row, author_login: "ada" }, { ...row, id: "review-pr", number: 2, author_login: "grace" }]);
  mocks.queue.mockResolvedValue(new Map([[2, ["ADA"]]]));
  const body = await (await GET(new NextRequest("http://localhost/api/pull-requests"))).json();
  expect(body.pullRequests).toEqual([
    expect.objectContaining({ prId: "new-pr", createdByMe: true, reviewRequestedForMe: false }),
    expect.objectContaining({ prId: "review-pr", createdByMe: false, reviewRequestedForMe: true }),
  ]);
  expect(mocks.queue).toHaveBeenCalledOnce();
  expect(mocks.queue).toHaveBeenCalledWith("owner", expect.objectContaining({ repoFullName: "acme/app" }));
});

it("does not scan review queues for completed PRs or a disconnected personal identity", async () => {
  mocks.identities.mockResolvedValue([{ provider: "github", account_login: "ada" }]);
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue([{ ...row, state: "closed" }]);
  await GET(new NextRequest("http://localhost/api/pull-requests?state=all"));
  expect(mocks.queue).not.toHaveBeenCalled();
});

it("keeps the cached PR list available when the forge review queue fails", async () => {
  mocks.identities.mockResolvedValue([{ provider: "github", account_login: "ada" }]);
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue([row]);
  mocks.queue.mockRejectedValue(new Error("Offline"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const body = await (await GET(new NextRequest("http://localhost/api/pull-requests"))).json();
    expect(body.pullRequests).toHaveLength(1);
    expect(body.pullRequests[0].reviewRequestedForMe).toBe(false);
  } finally { log.mockRestore(); }
});


it("counts Numo PRs as mine only when my run actually opened the PR", async () => {
  mocks.identities.mockResolvedValue([{ provider: "github", account_login: "numo-bot" }]);
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue([row, { ...row, id: "fixed-pr", number: 2 }, { ...row, id: "other-pr", number: 3, author_login: "numo-bot" }]);
  mocks.runs = [
    { id: "my-opening", created_by: "owner", pr_number: 1, status: "completed", repo_link: { provider: "github", repo_full_name: "acme/app" } },
    { id: "my-fix", created_by: "owner", pr_number: 2, status: "completed", repo_link: { provider: "github", repo_full_name: "acme/app" } },
    { id: "their-opening", created_by: "other", pr_number: 3, status: "completed", repo_link: { provider: "github", repo_full_name: "acme/app" } },
  ];
  mocks.opened = [{ run_id: "my-opening" }, { run_id: "their-opening" }];
  const body = await (await GET(new NextRequest("http://localhost/api/pull-requests"))).json();
  expect(body.pullRequests.map((pr: { createdByMe: boolean; numoOpened: boolean }) => [pr.createdByMe, pr.numoOpened]))
    .toEqual([[true, true], [false, false], [false, true]]);
});

it("caps completed PRs at ten and requests the next ten independently of open PRs", async () => {
  mocks.syncs.mockResolvedValue(new Map([["github:acme/app", { synced_at: "fresh" }]]));
  mocks.list.mockResolvedValue(Array.from({ length: 11 }, (_, index) => ({
    ...row, id: `completed-${index}`, number: index + 1, state: index % 2 ? "closed" : "merged",
  })));
  const body = await (await GET(new NextRequest("http://localhost/api/pull-requests?state=completed&limit=100&offset=10"))).json();
  expect(body.pullRequests).toHaveLength(10);
  expect(body.hasMore).toBe(true);
  expect(mocks.list).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
    limit: 11, offset: 10, states: ["merged", "closed"],
  });
  expect(mocks.queue).not.toHaveBeenCalled();
});
