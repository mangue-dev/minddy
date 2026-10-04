import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), rpc: vi.fn(), broadcast: vi.fn(), stamp: vi.fn(),
  before: { number: 1, issue_id: "issue", state: "open", head_sha: "old", updated_at: "2026-10-04T12:00:00Z" } }));
vi.mock("./forge", () => ({ forgeFor: () => ({ listPullRequests: mocks.list }) }));
vi.mock("./pr-live", () => ({ broadcastPrChangedByNumber: mocks.broadcast }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ rpc: mocks.rpc, from: (table: string) => {
  const chain = { select: () => chain, eq: () => chain,
    upsert: mocks.stamp,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === "pull_requests" ? [mocks.before] : [], error: null }).then(resolve) };
  return chain;
} }) }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ repositoryStorageName: async (_provider: string, name: string) => name, decodeRepositoryName: async (_provider: string, name: string) => name }));
vi.mock("./pull-request-url-content", () => ({ shouldEncryptPullRequestUrl: () => false, decodePullRequestUrlRow: async (row: unknown) => row }));
vi.mock("./pull-request-content", () => ({ shouldEncryptPullRequestContent: () => false, decodePullRequestContentRow: async (row: unknown) => row }));
import { needsRepoSync, syncRepoPullRequests } from "./pull-requests";

const options = { provider: "github" as const, repoFullName: "acme/app", token: "reader" };
const pull = { number: 1, url: "https://example.test/pull/1", state: "open", headSha: "old", updatedAt: "2026-10-04T12:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.stamp.mockResolvedValue({ error: null }); });

it("does not rewrite or broadcast unchanged PRs in frequent discovery sweeps", async () => {
  mocks.list.mockResolvedValue({ pulls: [pull], truncated: false });
  expect(await syncRepoPullRequests(options)).toEqual({ count: 1, truncated: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect(mocks.broadcast).not.toHaveBeenCalled();
  expect(mocks.stamp).toHaveBeenCalledOnce();
});

it("broadcasts a changed head by comparing with the pre-sweep snapshot", async () => {
  mocks.list.mockResolvedValue({ pulls: [{ ...pull, headSha: "new", updatedAt: "2026-10-04T12:01:00Z" }], truncated: false });
  mocks.rpc.mockResolvedValue({ data: { applied: true, row: { ...mocks.before, id: "pr", provider: "github", repo_full_name: "acme/app", head_sha: "new" } }, error: null });
  await syncRepoPullRequests(options);
  expect(mocks.broadcast).toHaveBeenCalledWith(expect.objectContaining({ number: 1, parts: ["pr", "conversation", "commits"] }));
});

it("recovers invalid sync stamps and catches up after one minute", () => {
  expect(needsRepoSync(undefined)).toBe(true);
  expect(needsRepoSync({ synced_at: "invalid" } as never)).toBe(true);
  expect(needsRepoSync({ synced_at: new Date(Date.now() - 60_000).toISOString() } as never)).toBe(true);
  expect(needsRepoSync({ synced_at: new Date().toISOString() } as never)).toBe(false);
});
