import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ list: vi.fn(), syncs: vi.fn(), sweep: vi.fn(), repos: vi.fn() }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ createRepositoryNameDecoder: () => async (_provider: string, name: string) => name }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => {
  const query = { select: () => query, in: () => query, order: async () => ({ data: [] }) };
  return { ok: true, user: { id: "owner" }, supabase: { from: () => query } };
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
vi.mock("@/lib/server/agent/runs", () => ({ getRun: vi.fn() }));

import { GET } from "@/app/api/pull-requests/route";
const row = { id: "new-pr", number: 1, repo_full_name: "acme/app", provider: "github",
  state: "open", title: "New PR", issue: null, issues: [], updated_at: "2026-10-04T12:00:00Z" };
beforeEach(() => {
  vi.clearAllMocks();
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
