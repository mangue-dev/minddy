import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GithubApiError } from "./pr";

const h = vi.hoisted(() => ({ find: vi.fn(), target: vi.fn(), getPr: vi.fn(),
  policy: vi.fn(), checks: vi.fn(), reviews: vi.fn(), threads: vi.fn(), actor: vi.fn(), actorProbe: vi.fn() }));
vi.mock("./pull-requests", async (original) => ({ ...await original<typeof import("./pull-requests")>(),
  findPullRequest: h.find }));
vi.mock("./repo-access", async (original) => ({ ...await original<typeof import("./repo-access")>(),
  resolveRepoCloneTargetForRepo: h.target,
  // PR scopes resolve the target with the caller's write capability (MIN-693).
  resolveRepoCloneTargetWithAccess: async (...args: unknown[]) => {
    const target = await h.target(...args);
    return target ? { target, canWrite: true } : null;
  } }));
vi.mock("./forge", async (original) => ({ ...await original<typeof import("./forge")>(),
  forgeFor: () => ({ getPullRequest: h.getPr, getRepositoryMergePolicy: h.policy,
    listChecks: h.checks, listReviews: h.reviews, listReviewThreads: h.threads }) }));
vi.mock("@/lib/server/git/forge-actor", () => ({
  resolveForgeActor: h.actor,
}));
import { prReadinessBatchResponse } from "./pr-actions";

const ids = Array.from({ length: 7 }, (_, index) => `pr-${index}`);
const closed = { state: "closed", merged: true, base: null, headSha: null };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.find.mockReset().mockImplementation(async (prId) => ({ id: prId, provider: "gitlab",
    repo_full_name: "acme/app", number: Number(prId.split("-")[1]) }));
  h.target.mockReset().mockResolvedValue({ provider: "gitlab", token: "repository-token", repoFullName: "acme/app" });
  h.getPr.mockReset().mockResolvedValue(closed);
  h.policy.mockReset().mockResolvedValue({ methods: ["squash"], checksMustPass: false,
    requiredCheckNames: [], requiredApprovals: 0, threadsMustBeResolved: false });
  h.checks.mockReset().mockResolvedValue({ checks: [], state: "success" });
  h.reviews.mockReset().mockResolvedValue(null); h.threads.mockReset().mockResolvedValue(null);
  h.actor.mockReset().mockResolvedValue({ kind: "none", reason: "noAccount", login: null });
  h.actorProbe.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("partial pull request readiness batch quota", () => {
  it.each([403, 429])("retains accepted rows, stops new starts and drains admitted workers after quota %s", async (status) => {
    const pending = ids.map(() => deferred<typeof closed>());
    h.getPr.mockImplementation(({ number }) => pending[number].promise);
    const responsePromise = prReadinessBatchResponse("reader", ids);
    try {
      await vi.waitFor(() => expect(h.getPr).toHaveBeenCalledTimes(4));
      pending[0].resolve(closed);
      await vi.waitFor(() => expect(h.getPr).toHaveBeenCalledTimes(5));
      pending[1].reject(new GithubApiError("Quota exhausted", status, "180"));
      await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
      expect(h.find).toHaveBeenCalledTimes(5);
      let settled = false; void responsePromise.then(() => { settled = true; });
      await Promise.resolve(); expect(settled).toBe(false);
      for (const index of [2, 3, 4]) pending[index].resolve(closed);
      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(179);
      const body = await response.json();
      expect(body.retryStatus).toBe(status);
      expect(body.readiness[ids[0]].state).toBe("merged");
      expect(body.unavailablePrIds.sort()).toEqual(ids.slice(1).sort());
      expect(h.getPr).toHaveBeenCalledTimes(5);
      expect(h.reviews).toHaveBeenCalledOnce();
    } finally {
      for (const item of pending) item.resolve(closed);
      await responsePromise;
    }
  });

  it("keeps the longest observed deadline while draining concurrent failures", async () => {
    h.getPr.mockImplementation(async ({ number }) => {
      if (number === 0) throw new GithubApiError("Quota exhausted", 403, "120");
      if (number === 1) throw new GithubApiError("Quota exhausted", 429, "300");
      return closed;
    });
    const response = await prReadinessBatchResponse("reader", ids.slice(0, 4));
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(299);
    expect((await response.json()).retryStatus).toBe(429);
  });

  it.each(["policy", "checks", "reviews", "threads"])("does not swallow quota from %s into accepted readiness", async (operation) => {
    h.getPr.mockResolvedValue({ state: "open", merged: false, base: "main", headSha: "head" });
    h[operation as "policy"].mockRejectedValue(new GithubApiError("Quota exhausted", 429, "120"));
    const response = await prReadinessBatchResponse("reader", [ids[0]]);
    const body = await response.json();
    expect(body.readiness).toEqual({}); expect(body.unavailablePrIds).toEqual([ids[0]]);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(119);
    expect(body.retryStatus).toBe(429);
    if (operation === "policy") expect(h.checks).not.toHaveBeenCalled();
  });

  it("keeps ordinary forbidden, missing and unknown rows unavailable without a quota header", async () => {
    h.getPr.mockImplementation(async ({ number }) => {
      if (number === 0) throw new GithubApiError("Forbidden", 403);
      if (number === 1) throw new GithubApiError("Missing", 404);
      if (number === 2) throw new Error("Unavailable");
      return closed;
    });
    const response = await prReadinessBatchResponse("reader", ids);
    const body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.has("retry-after")).toBe(false);
    expect(body.retryStatus).toBeUndefined(); expect(body.unavailablePrIds.sort()).toEqual(ids.slice(0, 3));
    expect(Object.keys(body.readiness).sort()).toEqual(ids.slice(3));
    expect(h.getPr).toHaveBeenCalledTimes(7);
  });

  it("preserves an absolute HTTP-date quota deadline", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-14T15:00:00Z"));
    h.getPr.mockRejectedValue(new GithubApiError("Quota exhausted", 403, "Wed, 14 Oct 2026 15:02:05 GMT"));
    const response = await prReadinessBatchResponse("reader", [ids[0]]);
    expect(response.headers.get("retry-after")).toBe("125");
    expect((await response.json()).retryStatus).toBe(403);
  });

  it.each([undefined, "unparseable"])("bounds a quota response with %s Retry-After using the existing fallback", async (retryAfter) => {
    h.getPr.mockRejectedValue(new GithubApiError("Quota exhausted", 429, retryAfter));
    const response = await prReadinessBatchResponse("reader", [ids[0]]);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(59);
    expect(Number(response.headers.get("retry-after"))).toBeLessThanOrEqual(60);
    expect((await response.json()).unavailablePrIds).toEqual([ids[0]]);
  });

  it("does not restart a deadline when admitted workers inherit the same quota error", async () => {
    const now = Date.parse("2026-10-14T15:00:00Z");
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const pending = ids.slice(0, 4).map(() => deferred<typeof closed>());
    h.getPr.mockImplementation(({ number }) => pending[number].promise);
    const responsePromise = prReadinessBatchResponse("reader", ids.slice(0, 4));
    try {
      await vi.waitFor(() => expect(h.getPr).toHaveBeenCalledTimes(4));
      pending[0].reject(new GithubApiError("Quota exhausted", 403, "125"));
      await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
      clock.mockReturnValue(now + 40_000);
      for (const item of pending.slice(1)) item.resolve(closed);
      const response = await responsePromise;
      expect(response.headers.get("retry-after")).toBe("85");
      expect((await response.json()).unavailablePrIds.sort()).toEqual(ids.slice(0, 4));
    } finally {
      for (const item of pending) item.resolve(closed);
      await responsePromise;
    }
  });

  it.each([403, 429])("does not swallow an actor quota %s into readiness", async (status) => {
    h.actor.mockRejectedValue(new GithubApiError("Quota exhausted", status, "125"));
    const response = await prReadinessBatchResponse("reader", [ids[0]]);
    const body = await response.json();
    expect(body.readiness).toEqual({}); expect(body.unavailablePrIds).toEqual([ids[0]]);
    expect(body.retryStatus).toBe(status);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(124);
  });

  it("does not admit the actor capability probe after a quota discovered during identity lookup", async () => {
    const identity = deferred<void>();
    const otherPr = deferred<typeof closed>();
    h.getPr.mockImplementation(({ number }) => number === 0 ? Promise.resolve(closed) : otherPr.promise);
    h.actor.mockImplementation(async ({ readControl }) => {
      await identity.promise;
      readControl?.beforeRead();
      h.actorProbe();
      return { kind: "none", reason: "noAccount" };
    });
    const responsePromise = prReadinessBatchResponse("reader", ids.slice(0, 2));
    try {
      await vi.waitFor(() => expect(h.actor).toHaveBeenCalledOnce());
      otherPr.reject(new GithubApiError("Quota exhausted", 429, "125"));
      await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
      identity.resolve();
      const response = await responsePromise;
      expect(h.actorProbe).not.toHaveBeenCalled();
      const body = await response.json();
      expect(body.readiness).toEqual({}); expect(body.unavailablePrIds.sort()).toEqual(ids.slice(0, 2));
    } finally {
      identity.resolve(); otherPr.resolve(closed); await responsePromise;
    }
  });

  it.each(["github", "gitlab"])("propagates a real %s actor quota notification through the scoped reader", async (provider) => {
    h.target.mockResolvedValue({ provider, token: "repository-token", repoFullName: "acme/app" });
    h.actor.mockImplementation(async ({ readControl }) => {
      readControl.onRateLimit(403, "125");
      return { kind: "actor", token: "user-token", login: "reader", capability: "read", avatarUrl: null };
    });
    const response = await prReadinessBatchResponse("reader", [ids[0]]);
    const body = await response.json();
    expect(body.retryStatus).toBe(403); expect(body.readiness).toEqual({});
    expect(body.unavailablePrIds).toEqual([ids[0]]);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(124);
  });
});
