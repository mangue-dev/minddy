import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pullRequestQueryOptions, pullRequestReadState } from "./pull-request-query";

afterEach(() => vi.unstubAllGlobals());

describe("pull request activation authority", () => {
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
});
