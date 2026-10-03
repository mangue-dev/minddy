import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPullRequestReadBudget, pullRequestQueryOptions, pullRequestReadState, pullRequestReadRetry, pullRequestReadRetryAt } from "./pull-request-query";
import { ApiError } from "./agent-api";

afterEach(() => vi.unstubAllGlobals());

describe("pull request activation authority", () => {
  it("does not prolong fallback rate pauses when another surface inherits the error", () => {
    const error = new ApiError("Forbidden"); error.status = 403;
    const first = pullRequestReadRetryAt({ error, errorUpdatedAt: 1000 });
    expect(first).toBe(61_000);
    expect(pullRequestReadRetryAt({ error, errorUpdatedAt: 40_000 })).toBe(first);
    expect(pullRequestReadRetryAt({ error, errorUpdatedAt: 80_000 })).toBeLessThan(80_000);
  });

  it("refreshes a completed preparation even with a recent account cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
    const fetch = vi.fn(async () => Response.json({ pr: { headSha: "new-head" }, files: [] }));
    vi.stubGlobal("fetch", fetch);
    const options = pullRequestQueryOptions("pr1");
    client.setQueryData(options.queryKey, { pr: { headSha: "old-head" }, files: [], readStartedAt: 1 });
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pr?.headSha).toBe("new-head"));
    expect(fetch).toHaveBeenCalledOnce();
    stop(); client.clear();
  });

  it("joins in-flight preparation but never calls a pre-activation read fresh", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const options = pullRequestQueryOptions("pr1");
    const pending = client.prefetchQuery({ ...options, staleTime: 5_000 });
    const activatedAt = Date.now() + 1;
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    expect(fetch).toHaveBeenCalledOnce();
    release(Response.json({ pr: { headSha: "prepared-head" }, files: [] })); await pending;
    expect(pullRequestReadState(observer.getCurrentResult(), activatedAt)).toBe("refreshing");
    stop(); client.clear();
  });

  it("distinguishes previous, exact, failed and offline data", () => {
    const previous = { isPending: false, isError: false, fetchStatus: "idle" as const, data: { readStartedAt: 5 } };
    expect(pullRequestReadState(previous, 10)).toBe("refreshing");
    expect(pullRequestReadState({ ...previous, data: { readStartedAt: 10 } }, 10)).toBe("fresh");
    expect(pullRequestReadState({ ...previous, isError: true }, 10)).toBe("error");
    expect(pullRequestReadState({ ...previous, fetchStatus: "paused" }, 10)).toBe("paused");
    expect(pullRequestReadState({ ...previous, isPending: true, data: undefined }, 10)).toBe("loading");
  });

  it.each(["pr-comments", "pr-commits", "pr-review-comments", "pull-request-readiness", "pull-requests"])("shares Retry-After from %s with detail and other foreground surfaces", async (key) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const error = new ApiError("Quota exhausted"); error.status = 403; error.retryAt = Date.now() + 120_000;
    await client.fetchQuery({ queryKey: [key, "other"], queryFn: async () => { throw error; } }).catch(() => {});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(() => assertPullRequestReadBudget(client)).toThrow(error);
    await expect(client.fetchQuery(pullRequestQueryOptions("pr1"))).rejects.toBe(error);
    expect(fetch).not.toHaveBeenCalled(); expect(pullRequestReadRetry(0, error)).toBe(false);
    // A replacement account client never inherits another account's error.
    const next = new QueryClient(); expect(() => assertPullRequestReadBudget(next)).not.toThrow();
    next.clear(); client.clear();
  });
});
