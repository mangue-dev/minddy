import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ list: vi.fn(), syncs: vi.fn(), sweep: vi.fn() }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ createRepositoryNameDecoder: () => async (_provider: string, name: string) => name }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: async () => {
  const query = { select: () => query, in: () => query, order: async () => ({ data: [] }) };
  return { ok: true, user: { id: "owner" }, supabase: { from: () => query } };
} }));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  findPullRequest: vi.fn(), loadPullRequestIssues: vi.fn(), resolvePrForRun: vi.fn(),
  listPullRequestsForUser: mocks.list, readRepoSyncStates: mocks.syncs,
  listVisibleRepos: async () => [{ provider: "github", repoFullName: "acme/app", project: { id: "project", key: "ACME", name: "Acme" } }],
  needsRepoSync: (state: { synced_at: string } | undefined) => !state || state.synced_at === "old",
  repoSyncKey: (provider: string, name: string) => `${provider}:${name}`,
  rowProvider: () => "github",
}));
vi.mock("@/lib/server/agent/pull-requests-sweep", () => ({ sweepRepo: mocks.sweep }));
vi.mock("@/lib/server/agent/runs", () => ({ getRun: vi.fn() }));

import { GET } from "@/app/api/pull-requests/route";
const row = { id: "new-pr", number: 1, repo_full_name: "acme/app", provider: "github",
  state: "open", title: "New PR", issue: null, issues: [], updated_at: "2026-10-04T12:00:00Z" };
beforeEach(() => vi.clearAllMocks());

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
