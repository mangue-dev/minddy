import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchAppTabDestination } from "./prefetch-tab-destination";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";

const response = (data: unknown = {}) => ({ ok: true, text: async () => JSON.stringify(data) });

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchMock = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  client.clear();
  vi.unstubAllGlobals();
});

const requested = () => fetchMock.mock.calls.map(([url]) => String(url).split("?")[0]);

describe("tab destination prefetch", () => {
  it("prepares Pages and Feedback through their actual consumer keys without board reads", async () => {
    fetchMock.mockImplementation(async () => ({ ...response({ posts: [], board_enabled: false }), json: async () => ({ posts: [], board_enabled: false }) }));
    prefetchAppTabDestination(client, "/projects/p/pages", new Set());
    prefetchAppTabDestination(client, "/projects/p/feedback", new Set());
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(requested()).toEqual(["/api/projects/p/pages", "/api/projects/p/feedback"]);
    expect(client.getQueryData(["feedback", "p"])).toEqual({ posts: [], board_enabled: false });
    prefetchAppTabDestination(client, "/projects/p/settings", new Set());
    expect(requested()).toHaveLength(2);
  });

  it("warms the routines list and the agent catalog once per destination", async () => {
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
  });

  it("maps project destinations to the five board reads", async () => {
    prefetchAppTabDestination(client, "/projects/p1?view=7", new Set());
    await vi.waitFor(() => expect(requested()).toEqual([
      "/api/projects/p1/issues",
      "/api/projects/p1/categories",
      "/api/projects/p1/members",
      "/api/projects/p1/objectives",
      "/api/projects/p1/issue-relations",
    ]));
  });

  it("skips the aggregate board read when the cache already carries data", async () => {
    client.setQueryData(GLOBAL_BOARD_KEY, { issues: [] });
    prefetchAppTabDestination(client, "/all", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/me/views"]));
  });

  it("prepares a pinned PR detail and list with the foreground query keys", async () => {
    client.setDefaultOptions({ queries: { retry: false, staleTime: 300_000 } });
    prefetchAppTabDestination(client, "/pull-requests?pr=pr1", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/pull-requests/pr1", "/api/pull-requests"]));
    expect(String(fetchMock.mock.calls[1][0])).toContain("pr=pr1");
    await vi.waitFor(() => expect(client.getQueryData(["pull-request", "pr1"])).toEqual({ readStartedAt: expect.any(Number) }));
    prefetchAppTabDestination(client, "/pull-requests?pr=pr1", new Set());
    await vi.waitFor(() => expect(requested()).toHaveLength(2));
  });

  it("bounds speculative PR details until the shared operation settles", async () => {
    let release!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const attempted = new Set<string>();
    prefetchAppTabDestination(client, "/pull-requests?pr=pr1", attempted);
    prefetchAppTabDestination(client, "/pull-requests?pr=pr2", attempted);
    expect(requested()).not.toContain("/api/pull-requests/pr2");
    expect(attempted.has("/pull-requests?pr=pr2")).toBe(false);
    release(response());
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    prefetchAppTabDestination(client, "/pull-requests?pr=pr2", attempted);
    await vi.waitFor(() => expect(requested()).toContain("/api/pull-requests/pr2"));
    const request = fetchMock.mock.calls.find(([url]) => url === "/api/pull-requests/pr1");
    expect(request?.[1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("cancels speculative detail work when the account client is retired", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal;
      signal!.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
    }));
    prefetchAppTabDestination(client, "/pull-requests?pr=pr1", new Set());
    await client.cancelQueries({ queryKey: ["pull-request", "pr1"] });
    expect(signal?.aborted).toBe(true);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    prefetchAppTabDestination(client, "/pull-requests?pr=pr2", new Set());
    await vi.waitFor(() => expect(requested()).toContain("/api/pull-requests/pr2"));
  });

  it("leaves unknown destinations alone", () => {
    prefetchAppTabDestination(client, "/settings", new Set());
    expect(requested()).toEqual([]);
  });
});
