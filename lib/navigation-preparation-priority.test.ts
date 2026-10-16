import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { createPrActivityPreparation } from "./pr-activity-preparation";
import { navigationPreparationHasRead, navigationPreparationOwnsRead, navigationPreparationPending, navigationPreparationPriority } from "./navigation-preparation-priority";
import { allPullRequestsQueryOptions } from "./use-agent-runs";

vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(async () => {}), isAppTabSurfaceReady: () => true }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
afterEach(() => vi.unstubAllGlobals());

it("tracks both exact reads of an owner and preserves a replacement against late completion", () => {
  const client = new QueryClient();
  const owner = navigationPreparationPriority(client);
  const first = ["issues", "project"], second = ["categories", "project"];
  const replacement = ["issues", "project"];
  for (const key of [first, second]) client.setQueryData(key, []);
  owner.acquire(); owner.startRead(first); owner.startRead(second);
  expect(navigationPreparationOwnsRead(client, first)).toBe(true);
  expect(navigationPreparationOwnsRead(client, second)).toBe(true);
  owner.startRead(replacement); owner.finishRead(first);
  expect(navigationPreparationOwnsRead(client, replacement)).toBe(true);
  owner.finishRead(second);
  expect(navigationPreparationHasRead(client)).toBe(true);
  const observer = new QueryObserver(client, { queryKey: replacement, enabled: false });
  const stop = observer.subscribe(() => {});
  expect(navigationPreparationOwnsRead(client, replacement)).toBe(true);
  observer.setOptions({ queryKey: replacement, enabled: true, staleTime: Infinity });
  expect(navigationPreparationOwnsRead(client, replacement)).toBe(false);
  owner.release();
  expect(navigationPreparationPending(client)).toBe(false);
  expect(navigationPreparationHasRead(client)).toBe(false);
  stop(); client.clear();
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["pull-request", "pr"], { pr: { title: "Prepared detail" } });
  const tabs = new Set<() => void>(), auxiliary = new Set<() => void>();
  const navigation = createPrTabPreparation(client, (task) => { tabs.add(task); return () => { tabs.delete(task); }; });
  const activity = createPrActivityPreparation(client, (task, delay) => {
    if (delay <= 50) auxiliary.add(task);
    return () => { auxiliary.delete(task); };
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => String(url).endsWith("/bootstrap?readers=members,objectives")
    ? new Response([
      { version: 1, reader: "members", ok: true, data: { members: [] } },
      { version: 1, reader: "objectives", ok: true, data: [] },
    ].map(frame => JSON.stringify(frame) + "\n").join(""), { headers: { "Content-Type": "application/x-ndjson" } })
    : Response.json(String(url).endsWith("/pages/page")
    ? { id: "page", project_id: "project", version: 1, content: { type: "doc", content: [] } }
    : ["/pages", "/issues", "/objectives"].some((suffix) => String(url).endsWith(suffix)) ? []
    : String(url).endsWith("/members") ? { members: [] }
    : String(url).endsWith("/commits") ? { commits: [] } : { comments: [], timeline: [] }));
  vi.stubGlobal("fetch", fetch);
  const flush = async (tasks: Set<() => void>) => {
    for (const task of Array.from(tasks)) { tasks.delete(task); task(); }
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await Promise.resolve();
  };
  return { client, navigation, activity, fetch, tabs, auxiliary, flush,
    close: () => { navigation.dispose(); activity.dispose(); client.clear(); } };
}

it("prepares open Page prerequisites before optional PR activity and resumes without polling", async () => {
  const view = setup();
  try {
    view.activity.update(["pr"]);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/page"]);
    expect(navigationPreparationPending(view.client)).toBe(true);
    expect(view.auxiliary.size).toBe(0);
    for (let step = 0; step < 8 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(navigationPreparationPending(view.client)).toBe(false);
    expect(view.fetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/projects/project/pages/page", "/api/projects/project/pages", "/api/projects/project/issues",
      "/api/projects/project/bootstrap?readers=members,objectives",
    ]);
    expect(view.client.getQueryData(["members", "project"])).toEqual({ members: [] });
    expect(view.client.getQueryData(["objectives", "project"])).toEqual([]);
    await view.flush(view.auxiliary);
    expect(view.fetch.mock.calls.some(([url]) => String(url).endsWith("/comments"))).toBe(true);
  } finally { view.close(); }
});

it("releases priority after failed prerequisites and when a navigation owner is retired", async () => {
  const view = setup();
  try {
    view.fetch.mockRejectedValueOnce(new Error("Unavailable Page"));
    view.activity.update(["pr"]);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/page"]);
    for (let step = 0; step < 8 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(navigationPreparationPending(view.client)).toBe(false);
    view.navigation.visit("/home", ["/home", "/projects/project/pages/another"]);
    expect(navigationPreparationPending(view.client)).toBe(true);
    view.navigation.dispose();
    expect(navigationPreparationPending(view.client)).toBe(false);
    expect(view.tabs.size).toBe(0);
    await view.flush(view.auxiliary);
    expect(view.fetch.mock.calls.some(([url]) => String(url).endsWith("/comments"))).toBe(true);
  } finally { view.close(); }
});

it("prepares Pages ahead of old PR tabs without reserving optional PR metadata priority", async () => {
  const view = setup();
  try {
    const oldPrTabs = Array.from({ length: 45 }, (_, index) => `/pull-requests?pr=old-${index}`);
    view.navigation.visit("/home", ["/home", ...oldPrTabs, "/projects/project/pages/page"]);
    await view.flush(view.tabs); await view.flush(view.tabs);
    expect(view.fetch.mock.calls.slice(0, 2).map(([url]) => url)).toEqual([
      "/api/projects/project/pages/page", "/api/projects/project/pages",
    ]);
    for (let step = 0; step < 4 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(view.fetch.mock.calls.slice(0, 4).map(([url]) => url)).toEqual([
      "/api/projects/project/pages/page", "/api/projects/project/pages", "/api/projects/project/issues",
      "/api/projects/project/bootstrap?readers=members,objectives",
    ]);
    expect(view.client.getQueryData(["members", "project"])).toEqual({ members: [] });
    expect(view.client.getQueryData(["objectives", "project"])).toEqual([]);
    expect(navigationPreparationPending(view.client)).toBe(false);
    view.navigation.visit("/home", ["/home", ...oldPrTabs]);
    expect(navigationPreparationPending(view.client)).toBe(false);
  } finally { view.close(); }
});

it("resumes optional pinned lists after recent activity settles instead of starving it", async () => {
  const view = setup();
  try {
    view.client.setQueryData(allPullRequestsQueryOptions().queryKey, { pullRequests: [{ prId: "pr", pr_state: "draft" }] });
    view.activity.update(["pr"]);
    view.navigation.visit("/home", ["/home", "/pull-requests?pr=pr", "/projects/project/pages/page"]);
    for (let step = 0; step < 8 && view.tabs.size; step++) await view.flush(view.tabs);
    expect(navigationPreparationPending(view.client)).toBe(false);
    expect(view.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/pull-requests?"))).toBe(false);
    await view.flush(view.auxiliary);
    expect(view.fetch.mock.calls.filter(([url]) => String(url).includes("/api/pull-requests/pr/")).length).toBe(3);
    await view.flush(view.tabs);
    expect(view.fetch.mock.calls.some(([url]) => String(url).startsWith("/api/pull-requests?"))).toBe(true);
  } finally { view.close(); }
});

it("does not wait for activity of a failed recent detail", async () => {
  const view = setup();
  try {
    view.client.setQueryData(allPullRequestsQueryOptions().queryKey, { pullRequests: [{ prId: "pr", pr_state: "draft" }] });
    await view.client.fetchQuery({ queryKey: ["pull-request", "pr"], queryFn: async () => { throw new Error("Detail unavailable"); } }).catch(() => {});
    view.navigation.visit("/home", ["/home", "/pull-requests?pr=other"]);
    await view.flush(view.tabs);
    expect(view.fetch).toHaveBeenCalled();
  } finally { view.close(); }
});

it.each([false, true])("shares one speculative Page read with five activities and yields to activation (disabled observer: %s)", async (disabledObserver) => {
  const view = setup();
  let finishPage!: () => void;
  const signals: AbortSignal[] = [];
  let stopObserver: (() => void) | undefined;
  let observer: QueryObserver | undefined;
  const pageKey: readonly unknown[] = ["page", "page"];
  try {
    const prs = ["pr", "second", "third"];
    view.client.setQueryData(allPullRequestsQueryOptions().queryKey, { pullRequests: prs.map((prId) => ({ prId, pr_state: "draft" })) });
    for (const id of prs) view.client.setQueryData(["pull-request", id], { pr: { title: "Prepared detail" } });
    view.fetch.mockImplementation((url, init) => {
      if (String(url).endsWith("/pages/page")) return new Promise((resolve) => { finishPage = () => resolve(Response.json({ id: "page", project_id: "project", version: 1 })); });
      if (String(url).includes("/api/pull-requests/")) return new Promise((_resolve, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
      });
      return Promise.resolve(Response.json([]));
    });
    view.activity.update(prs);
    if (disabledObserver) {
      observer = new QueryObserver(view.client, { queryKey: pageKey, enabled: false });
      stopObserver = observer.subscribe(() => {});
    }
    view.navigation.visit("/home", ["/home", "/projects/project/pages/page"]);
    for (const task of Array.from(view.tabs)) { view.tabs.delete(task); task(); }
    await vi.waitFor(() => expect(finishPage).toBeDefined());
    for (const task of Array.from(view.auxiliary)) { view.auxiliary.delete(task); task(); }
    await vi.waitFor(() => expect(signals).toHaveLength(5));
    expect(view.client.isFetching()).toBe(6);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    if (observer) observer.setOptions({ queryKey: pageKey, enabled: true });
    else {
      observer = new QueryObserver(view.client, { queryKey: pageKey });
      stopObserver = observer.subscribe(() => {});
    }
    await vi.waitFor(() => expect(signals.every((signal) => signal.aborted)).toBe(true));
    expect(view.client.getQueryState(["page", "page"])?.fetchStatus).toBe("fetching");
    finishPage();
    await vi.waitFor(() => expect(view.client.isFetching()).toBe(0));
  } finally { stopObserver?.(); finishPage?.(); view.close(); }
});
