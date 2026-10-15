import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The PR badge count is read on every page and polled every minute. Its
 * answer is complete once the count is known: the sync stamps only decide
 * which repositories to sweep after the response, so reading them must not
 * hold the count back, and a failure there must not turn the count into a 500.
 */

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  readRepoSyncStates: vi.fn(),
  sweepRepo: vi.fn(),
}));

vi.mock("next/server", async (original) => ({
  ...await original<typeof import("next/server")>(),
  after: mocks.after,
}));
vi.mock("@/lib/server/api-auth", () => ({
  getAuthedUser: async () => ({ ok: true, user: { id: "user-1" }, supabase: {} }),
}));
vi.mock("@/lib/server/agent/pull-requests", () => ({
  listVisibleRepos: async () => [
    { provider: "github", repoFullName: "acme/fresh" },
    { provider: "github", repoFullName: "acme/stale" },
    { provider: "github", repoFullName: "acme/stale" },
    { provider: "gitlab", repoFullName: "acme/never" },
  ],
  countPullRequestsForUser: async () => 7,
  readRepoSyncStates: mocks.readRepoSyncStates,
  repoSyncKey: (provider: string, name: string) => `${provider}:${name}`,
  needsRepoSync: (state?: { fresh: boolean }) => !state?.fresh,
}));
vi.mock("@/lib/server/agent/pull-requests-sweep", () => ({ sweepRepo: mocks.sweepRepo }));

const { GET } = await import("@/app/api/pull-requests/count/route");

const call = () => GET(new NextRequest("https://minddy.test/api/pull-requests/count"));

/** Run the callbacks scheduled with `after()`, as the platform does once the response is sent. */
async function runScheduled() {
  for (const [callback] of mocks.after.mock.calls) await (callback as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sweepRepo.mockResolvedValue(false);
});

describe("GET /api/pull-requests/count", () => {
  it("answers the count without waiting for the sync stamps", async () => {
    mocks.readRepoSyncStates.mockReturnValue(new Promise(() => {}));
    let settled = false;
    const response = call().then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(await (await response).json()).toEqual({ count: 7 });
    expect(mocks.sweepRepo).not.toHaveBeenCalled();
  });

  it("sweeps each stale repository once, after the response", async () => {
    mocks.readRepoSyncStates.mockResolvedValue(new Map([["github:acme/fresh", { fresh: true }]]));
    expect(await (await call()).json()).toEqual({ count: 7 });
    await runScheduled();
    expect(mocks.readRepoSyncStates).toHaveBeenCalledTimes(1);
    expect(mocks.sweepRepo.mock.calls.map(([, repo]) => repo.repoFullName))
      .toEqual(["acme/stale", "acme/never"]);
  });

  it("keeps the count when the sync stamps cannot be read", async () => {
    mocks.readRepoSyncStates.mockRejectedValue(new Error("stamp read failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 7 });
    await runScheduled();
    expect(mocks.sweepRepo).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
