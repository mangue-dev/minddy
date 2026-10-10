import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { pullRequestQueryOptions } from "./pull-request-query";
import { ApiError } from "./agent-api";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

afterEach(() => vi.unstubAllGlobals());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tasks = new Set<() => void>();
  const preparation = createPrTabPreparation(client, (task) => {
    tasks.add(task); return () => { tasks.delete(task); };
  });
  const flush = () => { for (const task of Array.from(tasks)) { tasks.delete(task); task(); } };
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ pr: { headSha: "head" } }));
  vi.stubGlobal("fetch", fetch);
  return { client, preparation, flush, fetch, tasks };
}

describe("account-owned PR preparation", () => {
  it("selects frequently visited late PRs across twelve mixed tabs without idle polling", async () => {
    const { client, preparation, flush, fetch, tasks } = setup();
    const hrefs = ["/home", "/all", "/statistics", "/routines", "/projects/a", "/projects/b", "/admin", "/projects/c",
      "/pull-requests?pr=early", "/pull-requests?pr=late1", "/projects/d", "/pull-requests?pr=late2"];
    for (const index of [9, 0, 11, 3, 9, 1, 11, 11, 9, 11, 8, 0]) preparation.visit(hrefs[index], hrefs);
    flush();
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/api/pull-requests/late2");
    flush(); expect(fetch).toHaveBeenCalledOnce(); expect(tasks.size).toBe(0);
    preparation.visit(hrefs[0], hrefs); flush();
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(fetch.mock.calls[1][0]).toBe("/api/pull-requests/late1");
    preparation.dispose(); client.clear();
  });

  it("waits for active work and aborts unobserved speculation when foreground work arrives", async () => {
    const { client, preparation, flush, fetch } = setup();
    let release!: () => void;
    const active = client.fetchQuery({ queryKey: ["active"], queryFn: () => new Promise<string>((resolve) => { release = () => resolve("done"); }) });
    preparation.visit("/pull-requests?pr=late", ["/home", "/pull-requests?pr=late"]);
    preparation.visit("/home", ["/home", "/pull-requests?pr=late"]); flush();
    expect(fetch).not.toHaveBeenCalled();
    release(); await active; flush();
    let signal!: AbortSignal;
    // Replace the immediately resolved response before the deferred scheduler runs.
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await client.invalidateQueries({ queryKey: ["pull-request", "late"] });
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    preparation.visit("/home", ["/home", "/pull-requests?pr=late"]); flush();
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal.aborted).toBe(false);
    await client.fetchQuery({ queryKey: ["foreground"], queryFn: async () => "done" });
    expect(signal.aborted).toBe(true);
    preparation.dispose(); client.clear();
  });

  it("preserves a foreground observer that joins preparation and cancels on account retirement", async () => {
    const { client, preparation, flush, fetch } = setup();
    let signal!: AbortSignal;
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    const hrefs = ["/home", "/pull-requests?pr=late"];
    preparation.visit(hrefs[1], hrefs); preparation.visit(hrefs[0], hrefs); flush();
    const observer = new QueryObserver(client, pullRequestQueryOptions("late"));
    const stop = observer.subscribe(() => {});
    await client.fetchQuery({ queryKey: ["foreground"], queryFn: async () => "done" });
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(signal.aborted).toBe(false); preparation.dispose(); expect(signal.aborted).toBe(false);
    stop(); await client.cancelQueries(); expect(signal.aborted).toBe(true); client.clear();
  });

  it("honors an account Retry-After across different PRs without retrying idle work", async () => {
    const { client, preparation, flush, fetch } = setup();
    const error = new ApiError("Limited"); error.status = 429; error.retryAt = Date.now() + 60_000;
    await client.fetchQuery({ queryKey: ["pull-request", "limited"], queryFn: async () => { throw error; } }).catch(() => {});
    const hrefs = ["/home", "/pull-requests?pr=late"];
    preparation.visit(hrefs[1], hrefs); preparation.visit(hrefs[0], hrefs); flush();
    expect(fetch).not.toHaveBeenCalled();
    await client.fetchQuery(pullRequestQueryOptions("other")).catch(() => {});
    expect(fetch).not.toHaveBeenCalled(); preparation.dispose(); client.clear();
  });
});
