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

async function drain(prepared: ReturnType<typeof setup>) {
  for (let index = 0; index < 20; index++) {
    prepared.flush();
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    await Promise.resolve();
    if (!prepared.tasks.size) return;
  }
  throw new Error("Preparation did not settle within its read budget");
}

const fixtureResponse = (url: string) => Response.json(url.endsWith("/pages/page")
  ? { id: "page", content: { type: "doc", content: [] } }
  : url.endsWith("/members") ? { members: [] }
  : url.endsWith("/integrations") ? { integrations: [], isOwner: true } : []);

describe("account-owned PR preparation", () => {
  it("warms every prerequisite of never-visited open project and Page tabs sequentially", async () => {
    const prepared = setup();
    let concurrent = 0, maximum = 0;
    prepared.fetch.mockImplementation(async (url) => {
      maximum = Math.max(maximum, ++concurrent);
      await Promise.resolve(); concurrent--;
      return fixtureResponse(String(url));
    });
    prepared.preparation.visit("/home", ["/home", "/projects/new", "/projects/new/pages/page"]);
    await drain(prepared);
    expect(prepared.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/new/issues", "/api/projects/new/categories", "/api/projects/new/members",
      "/api/projects/new/objectives", "/api/projects/new/issue-relations", "/api/projects/new/integrations",
      "/api/projects/new/views", "/api/projects/new/pages/page", "/api/projects/new/pages",
    ]);
    expect(maximum).toBe(1);
    expect(prepared.client.getQueryData(["views", "new"])).toEqual([]);
    prepared.flush(); expect(prepared.tasks.size).toBe(0);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("bounds large open-tab collections and prepares at most one unvisited PR detail", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", "/pull-requests?pr=unvisited", "/pull-requests?pr=another",
      ...Array.from({ length: 20 }, (_, index) => `/projects/p${index}`)]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(10);
    const details = prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"));
    expect(details.map(([url]) => url)).toEqual(["/api/pull-requests/unvisited"]);
    expect(prepared.tasks.size).toBe(0);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("caps board-only speculation at twelve reads without continuing to later open destinations", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", ...Array.from({ length: 20 }, (_, index) => `/projects/p${index}`)]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(12);
    expect(prepared.fetch.mock.calls.every(([url]) => /^\/api\/projects\/p[01]\//.test(String(url)))).toBe(true);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("does not retry a failed prerequisite until a new navigation opportunity", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => String(url).endsWith("/issues")
      ? Response.json({ error: "Unavailable" }, { status: 503 }) : fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", "/projects/new"]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(7);
    expect(prepared.client.getQueryState(["issues", "new"])?.status).toBe("error");
    prepared.flush(); expect(prepared.tasks.size).toBe(0);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it.each(["issues", "categories", "members", "objectives", "issue-relations", "integrations", "views"])("aborts an unobserved %s prerequisite when its account retires", async (resource) => {
    const prepared = setup();
    let signal!: AbortSignal;
    prepared.fetch.mockImplementation((url, init) => String(url).endsWith(`/${resource}`) ? new Promise((_resolve, reject) => {
      signal = init!.signal!;
      signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }) : Promise.resolve(fixtureResponse(String(url))));
    prepared.preparation.visit("/home", ["/home", "/projects/new"]);
    for (let index = 0; index < 7 && !signal; index++) {
      prepared.flush();
      await vi.waitFor(() => expect(prepared.fetch.mock.calls.length).toBeGreaterThan(index));
      if (!signal) await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    }
    expect(signal).toBeDefined();
    prepared.preparation.dispose();
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    expect(prepared.tasks.size).toBe(0);
    prepared.client.clear();
  });

  it("selects frequently visited late PRs across twelve mixed tabs without idle polling", async () => {
    const { client, preparation, flush, fetch, tasks } = setup();
    const hrefs = ["/home", "/all", "/statistics", "/routines", "/projects/a", "/projects/b", "/admin", "/projects/c",
      "/pull-requests?pr=early", "/pull-requests?pr=late1", "/projects/d", "/pull-requests?pr=late2"];
    for (const index of [9, 0, 11, 3, 9, 1, 11, 11, 9, 11, 8, 0]) preparation.visit(hrefs[index], hrefs);
    flush();
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe("/api/pull-requests/late2");
    await drain({ client, preparation, flush, fetch, tasks });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"))).toHaveLength(1);
    expect(tasks.size).toBe(0);
    preparation.visit(hrefs[0], hrefs); flush();
    await drain({ client, preparation, flush, fetch, tasks });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual(["/api/pull-requests/late2", "/api/pull-requests/late1"]);
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

  it("cancels prepared PR lists on account retirement through the shared authorized read", async () => {
    const { client, preparation, flush, fetch } = setup();
    let signal!: AbortSignal;
    fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    preparation.visit("/home", ["/home", "/pull-requests"]); flush();
    await vi.waitFor(() => expect(signal).toBeDefined());
    preparation.dispose(); expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    client.clear();
  });
});
