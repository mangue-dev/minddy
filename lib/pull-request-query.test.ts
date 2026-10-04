// @vitest-environment jsdom
import { focusManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPullRequestReadBudget, pullRequestQueryOptions, pullRequestReadState, pullRequestReadRetry, pullRequestReadRetryAt } from "./pull-request-query";
import { ApiError } from "./agent-api";
import { nextReadActivationSequence, readActivationSession } from "./read-activation-sequence";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("pull request activation authority", () => {
  it.each([403, 429])("resumes detail polling at the Retry-After deadline after a %s response", async (status) => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: "Quota exhausted" }, { status, headers: { "Retry-After": "120" } }))
      .mockResolvedValueOnce(Response.json({ pr: { headSha: "recovered" }, files: [] }));
    vi.stubGlobal("fetch", fetch);
    const observer = new QueryObserver(client, pullRequestQueryOptions("pr1"));
    const stop = observer.subscribe(() => {});
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(observer.getCurrentResult().isError).toBe(true);
      await vi.advanceTimersByTimeAsync(119_999);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(observer.getCurrentResult().data?.pr?.headSha).toBe("recovered");
      expect(pullRequestReadState(observer.getCurrentResult(), 0)).toBe("fresh");
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { stop(); client.clear(); }
  });

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
    client.setQueryData(options.queryKey, { pr: { headSha: "old-head" }, files: [] });
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.pr?.headSha).toBe("new-head"));
    expect(fetch).toHaveBeenCalledOnce();
    stop(); client.clear();
  });

  it.each(["same millisecond", "clock rollback"])("joins in-flight preparation but never calls a pre-activation read fresh with %s", async (timing) => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const options = pullRequestQueryOptions("pr1");
    const pending = client.prefetchQuery({ ...options, staleTime: 5_000 });
    if (timing === "clock rollback") vi.mocked(Date.now).mockReturnValue(50);
    const activationSequence = nextReadActivationSequence();
    const observer = new QueryObserver(client, options);
    const stop = observer.subscribe(() => {});
    expect(fetch).toHaveBeenCalledOnce();
    release(Response.json({ pr: { headSha: "prepared-head" }, files: [] })); await pending;
    expect(pullRequestReadState(observer.getCurrentResult(), activationSequence)).toBe("refreshing");
    stop(); client.clear();
  });

  it("distinguishes previous, authoritative, persisted, failed and offline data", () => {
    const previous = { isPending: false, isError: false, fetchStatus: "idle" as const, data: { readSequence: 5, readSession: readActivationSession } };
    expect(pullRequestReadState(previous, 10)).toBe("refreshing");
    expect(pullRequestReadState({ ...previous, data: { readSequence: 11, readSession: readActivationSession } }, 10)).toBe("fresh");
    expect(pullRequestReadState({ ...previous, data: { readSequence: 100, readSession: "previous-page-load" } }, 10)).toBe("refreshing");
    expect(pullRequestReadState({ ...previous, data: {} }, 10)).toBe("refreshing");
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
