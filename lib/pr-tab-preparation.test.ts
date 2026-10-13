import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { pullRequestQueryOptions } from "./pull-request-query";
import { ApiError } from "./agent-api";
import { appTabPreparationQueries } from "./prefetch-tab-destination";

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
  ? { id: "page", project_id: "new", version: 1, content: { type: "doc", content: [] } }
  : url.endsWith("/members") ? { members: [] }
  : url.endsWith("/integrations") ? { integrations: [], isOwner: true } : []);

describe("account-owned PR preparation", () => {
  it("retains Page preparation across a fully cached project activation and cancels for a cold destination", async () => {
    const prepared = setup(); let signal!: AbortSignal;
    for (const options of appTabPreparationQueries(prepared.client, "/projects/cached")) prepared.client.setQueryData(options.queryKey, []);
    prepared.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/pages/page", "/projects/cached"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      prepared.preparation.visit("/projects/cached", ["/projects/cached", "/projects/new/pages/page"]);
      expect(signal.aborted).toBe(false);
      prepared.preparation.visit("/projects/cold", ["/projects/cold", "/projects/new/pages/page"]);
      expect(signal.aborted).toBe(true);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });
  it("warms all seven neighboring project prerequisites alongside an open board and Page without parallel transport", async () => {
    const prepared = setup(); let concurrent = 0, maximum = 0;
    prepared.client.setQueryData(["projects"], [{ id: "new" }, { id: "neighbor" }]);
    prepared.fetch.mockImplementation(async (url) => {
      maximum = Math.max(maximum, ++concurrent);
      await Promise.resolve(); concurrent--;
      return fixtureResponse(String(url));
    });
    try {
      prepared.preparation.visit("/all", ["/all", "/projects/new", "/projects/new/pages/page"]);
      await drain(prepared);
      const calls = prepared.fetch.mock.calls.map(([url]) => String(url));
      expect(calls).toHaveLength(16);
      expect(calls.filter((url) => url.startsWith("/api/projects/neighbor/"))).toEqual([
        "/api/projects/neighbor/issues", "/api/projects/neighbor/categories", "/api/projects/neighbor/members",
        "/api/projects/neighbor/objectives", "/api/projects/neighbor/issue-relations", "/api/projects/neighbor/integrations", "/api/projects/neighbor/views",
      ]);
      expect(maximum).toBe(1);
      expect(appTabPreparationQueries(prepared.client, "/projects/neighbor").every((options) => prepared.client.getQueryState(options.queryKey)?.status === "success")).toBe(true);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("does not spend missing-destination slots on three already prepared boards", async () => {
    const prepared = setup(); prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    const ready = ["/projects/a", "/projects/b", "/projects/c"];
    for (const href of ready) for (const options of appTabPreparationQueries(prepared.client, href)) prepared.client.setQueryData(options.queryKey, []);
    try {
      prepared.preparation.visit("/home", ["/home", ...ready, "/projects/new/pages/page"]);
      await drain(prepared);
      expect(prepared.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/projects/new/pages/page", "/api/projects/new/pages"]);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("backs off canceled neighboring reads across repeated navigation opportunities", async () => {
    const prepared = setup(); let clock = 10_000_000;
    const time = vi.spyOn(Date, "now").mockImplementation(() => clock);
    prepared.client.setQueryData(["projects"], [{ id: "new" }, { id: "neighbor" }]);
    let signal!: AbortSignal;
    prepared.fetch.mockImplementation((url, init) => String(url).endsWith("/neighbor/issues") ? new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }) : Promise.resolve(fixtureResponse(String(url))));
    try {
      prepared.preparation.visit("/projects/new", ["/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      await prepared.client.fetchQuery({ queryKey: ["foreground"], queryFn: async () => "ready" });
      expect(signal.aborted).toBe(true); await drain(prepared);
      prepared.preparation.visit("/projects/new", ["/projects/new"]); await drain(prepared);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/neighbor/issues"))).toHaveLength(1);
      clock += 30_001; prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      prepared.preparation.visit("/projects/new", ["/projects/new"]); await drain(prepared);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/neighbor/issues"))).toHaveLength(2);
    } finally { time.mockRestore(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("preserves a foreground observer joining a neighboring read through account retirement", async () => {
    const prepared = setup(); let signal!: AbortSignal, finish!: () => void;
    prepared.client.setQueryData(["projects"], [{ id: "new" }, { id: "neighbor" }]);
    prepared.fetch.mockImplementation((_url, init) => new Promise((resolve) => { signal = init!.signal!; finish = () => resolve(Response.json([])); }));
    let stop = () => {};
    try {
      prepared.preparation.visit("/projects/new", ["/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      const observer = new QueryObserver(prepared.client, { queryKey: ["issues", "neighbor"] }); stop = observer.subscribe(() => {});
      prepared.preparation.dispose(); expect(signal.aborted).toBe(false);
      finish(); await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe("success"));
    } finally { stop(); finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

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

  it("bounds large unvisited board working sets before optional PR reads", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", "/pull-requests?pr=unvisited", "/pull-requests?pr=another",
      ...Array.from({ length: 20 }, (_, index) => `/projects/p${index}`)]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(12);
    const details = prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"));
    expect(details).toHaveLength(0);
    expect(prepared.fetch.mock.calls.every(([url]) => /^\/api\/projects\/p[01]\//.test(String(url)))).toBe(true);
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
