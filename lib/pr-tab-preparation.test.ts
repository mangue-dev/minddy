import { hashKey, onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation, isPassiveShellMaintenanceRead, SCOPED_PREPARATION_CONCURRENCY } from "./pr-tab-preparation";
import { pullRequestQueryOptions } from "./pull-request-query";
import { ApiError } from "./agent-api";
import { navigationPreparationPending } from "./navigation-preparation-priority";
import { prepareAppTabSurface } from "./app-tab-surfaces";
import { appTabPreparationQueries, isPreparedAppTabDestination, prefetchPullRequestDetail } from "./prefetch-tab-destination";
import { fetchPageNavigationData, isPreparedPageData, pageKey } from "./use-pages-query";
import { issuesQueryFn } from "./issues-api";
import { issueWrites, mergeServerIssue, removeIssueEverywhere } from "./optimistic/issue-writes";
import type { Issue } from "./types";
import { navigationWorkingSetQueryHashes } from "./navigation-working-set";

vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(), isAppTabSurfaceReady: () => true }));

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

afterEach(() => vi.unstubAllGlobals());

function setup() {
  vi.mocked(prepareAppTabSurface).mockClear();
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
  for (let index = 0; index < 128; index++) {
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
  it("publishes only actual inactive listed prerequisites without starting reads and retains them after transport priority ends", async () => {
    const prepared = setup();
    prepared.client.setQueryData(["projects"], [{ id: "new" }, { id: "neighbor" }]);
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    try {
      const before = prepared.client.getQueryCache().getAll().length;
      prepared.preparation.visit("/home", ["/home", "/projects/new"]);
      const expected = new Set(appTabPreparationQueries(prepared.client, "/projects/new").map((option) => hashKey(option.queryKey)));
      expect(navigationWorkingSetQueryHashes(prepared.client)).toEqual(expected);
      expect(prepared.client.getQueryCache().getAll()).toHaveLength(before);
      expect(prepared.fetch).not.toHaveBeenCalled();
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["issues", "neighbor"]))).toBe(false);
      await drain(prepared);
      expect(navigationPreparationPending(prepared.client)).toBe(false);
      expect(navigationWorkingSetQueryHashes(prepared.client)).toEqual(expected);
      prepared.preparation.visit("/routines", ["/routines", "/home"]);
      expect(navigationWorkingSetQueryHashes(prepared.client)).toEqual(new Set(
        appTabPreparationQueries(prepared.client, "/home").map((option) => hashKey(option.queryKey)),
      ));
      prepared.preparation.dispose();
      prepared.preparation.visit("/home", ["/home", "/projects/new"]);
      expect(navigationWorkingSetQueryHashes(prepared.client).size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it.each(["accepted", "rejected", "disposed"] as const)("waits for an actual selected insert's %s transition after an overlaid ordinary issues read", async (outcome) => {
    const prepared = setup(), unrelated = setup();
    // Selection fixtures omit unrelated issue fields; the real reader still applies its pending-write overlay.
    const old = { id: "old", project_id: "new", status: "triage", created_at: "2026-01-01" } as Issue;
    const pending = { ...old, id: "pending", created_at: "2026-01-02" };
    const href = "/projects/new/triage";
    const handle = issueWrites.begin({ kind: "insert", row: pending });
    const paths: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
      const path = String(url); paths.push(path);
      return path.endsWith("/new/issues") ? Response.json([old]) : Response.json([]);
    });
    vi.stubGlobal("fetch", fetch);
    try {
      for (const option of appTabPreparationQueries(prepared.client, href)) if (option.queryKey[0] !== "issues") prepared.client.setQueryData(option.queryKey, []);
      await prepared.client.fetchQuery({ queryKey: ["issues", "new"], queryFn: issuesQueryFn("new") });
      expect(prepared.client.getQueryData<Issue[]>(["issues", "new"])?.map((issue) => issue.id)).toEqual(["old", "pending"]);
      prepared.preparation.visit("/home", ["/home", href]); await drain(prepared);
      unrelated.preparation.visit("/home", ["/home", "/projects/other/triage"]);
      expect(paths).toEqual(["/api/projects/new/issues"]);
      expect(isPreparedAppTabDestination(prepared.client, href)).toBe(false);
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "pending"]))).toBe(false);
      expect(prepared.tasks.size).toBe(0);
      const unrelatedTasks = unrelated.tasks.size;
      if (outcome === "disposed") prepared.preparation.dispose();
      if (outcome === "rejected") {
        issueWrites.fail(handle);
        // The hook's rollback follows fail(), before the targeted wake's microtask.
        removeIssueEverywhere(prepared.client, "new", pending.id);
      } else {
        mergeServerIssue(prepared.client, "new", pending);
        issueWrites.settle(handle, pending);
        issueWrites.settle(handle, pending);
      }
      await Promise.resolve(); await drain(prepared);
      expect(unrelated.tasks.size).toBe(unrelatedTasks);
      const selected = outcome === "rejected" ? "old" : "pending";
      expect(paths).toEqual(outcome === "disposed" ? ["/api/projects/new/issues"] : [
        "/api/projects/new/issues", `/api/issues/${selected}/comments`, `/api/issues/${selected}/events`,
      ]);
      if (outcome !== "disposed") expect(isPreparedAppTabDestination(prepared.client, href)).toBe(true);
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", selected]))).toBe(outcome !== "disposed");
      expect(prepared.tasks.size).toBe(0);
    } finally {
      prepared.preparation.dispose(); unrelated.preparation.dispose();
      prepared.client.clear(); unrelated.client.clear(); issueWrites.reset();
    }
  });

  it("prepares pending patches and recently accepted creations without waiting for another transition", async () => {
    const prepared = setup(), href = "/projects/new/triage";
    const issue = { id: "existing", project_id: "new", status: "triage", created_at: "2026-01-01" } as Issue;
    issueWrites.settle(issueWrites.begin({ kind: "insert", row: issue }), issue);
    issueWrites.begin({ kind: "patch", id: issue.id, patch: { title: "Edited" } });
    prepared.fetch.mockImplementation(async (url) => String(url).endsWith("/new/issues") ? Response.json([issue]) : Response.json([]));
    try {
      for (const option of appTabPreparationQueries(prepared.client, href)) if (option.queryKey[0] !== "issues") prepared.client.setQueryData(option.queryKey, []);
      prepared.preparation.visit("/home", ["/home", href]); await drain(prepared);
      expect(prepared.fetch.mock.calls.map(([url]) => String(url))).toEqual([
        "/api/projects/new/issues", "/api/issues/existing/comments", "/api/issues/existing/events",
      ]);
      expect(isPreparedAppTabDestination(prepared.client, href)).toBe(true);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); issueWrites.reset(); }
  });
  it("discovers only one complete detail per populated listed secondary view after its ordinary list succeeds", async () => {
    const prepared = setup(); let active = 0, maximum = 0;
    const issues = Array.from({ length: 120 }, (_, index) => ({ id: `issue-${index}`, project_id: "new", status: "triage", created_at: new Date(index * 1000).toISOString() }));
    const objectives = Array.from({ length: 120 }, (_, index) => ({ id: `goal-${index}`, project_id: "new", status: "planned" }));
    const posts = Array.from({ length: 120 }, (_, index) => ({ id: `post-${index}`, project_id: "new", status: "open", vote_count: index,
      created_at: new Date(index * 1000).toISOString(), review_state: "published", sensitivity: null, category_ids: [] }));
    prepared.fetch.mockImplementation(async (url) => {
      maximum = Math.max(maximum, ++active); await Promise.resolve(); active--;
      const path = String(url);
      if (path.endsWith("/new/issues")) return Response.json(issues);
      if (path.endsWith("/new/objectives")) return Response.json(objectives);
      if (path.startsWith("/api/projects/new/feedback?")) return Response.json({ posts, board_enabled: false });
      if (path.endsWith("/feedback/post-119")) return Response.json({ post: posts[119] });
      if (path.includes("?count=1")) return Response.json({ count: 0 });
      return fixtureResponse(path);
    });
    const tabs = ["/home", "/projects/new/triage", "/projects/new/feedback", "/projects/new/objectives"];
    try {
      prepared.preparation.visit(tabs[0], tabs); await drain(prepared);
      for (const href of tabs.slice(1)) {
        expect(isPreparedAppTabDestination(prepared.client, href), href).toBe(true);
        for (const options of appTabPreparationQueries(prepared.client, href)) expect(prepared.client.getQueryState(options.queryKey)?.status).toBe("success");
      }
      expect(navigationWorkingSetQueryHashes(prepared.client)).toEqual(new Set(tabs.slice(1).flatMap((href) =>
        appTabPreparationQueries(prepared.client, href).map((option) => hashKey(option.queryKey)),
      )));
      const paths = prepared.fetch.mock.calls.map(([url]) => String(url));
      expect(paths.filter((path) => path.startsWith("/api/issues/"))).toEqual(["/api/issues/issue-119/comments", "/api/issues/issue-119/events"]);
      expect(paths.filter((path) => path.startsWith("/api/objectives/"))).toEqual([
        "/api/objectives/goal-0/comments", "/api/objectives/goal-0/events", "/api/objectives/goal-0/resources", "/api/objectives/goal-0/feedback?count=1",
      ]);
      expect(paths.filter((path) => /\/feedback\/post-/.test(path))).toEqual([
        "/api/projects/new/feedback/post-119", "/api/projects/new/feedback/post-119/comments", "/api/projects/new/feedback/post-119/events",
      ]);
      expect(paths).toHaveLength(18); expect(maximum).toBe(SCOPED_PREPARATION_CONCURRENCY);
      expect(paths.some((path) => path.includes("/settings") || path.includes("/git-link"))).toBe(false);
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("replaces superseded selected work while preserving an old detail's joined foreground read", async () => {
    const prepared = setup(); let finish!: () => void;
    const signals = new Map<string, AbortSignal>();
    for (const option of appTabPreparationQueries(prepared.client, "/projects/new/triage")) prepared.client.setQueryData(option.queryKey, []);
    const old = { id: "old", project_id: "new", status: "triage", created_at: "2026-01-01" };
    prepared.client.setQueryData(["issues", "new"], [old]);
    prepared.fetch.mockImplementation((url, init) => new Promise((resolve, reject) => {
      const path = String(url), signal = init!.signal!; signals.set(path, signal);
      if (path.endsWith("/comments")) finish = () => resolve(Response.json([]));
      signal.addEventListener("abort", () => reject(new Error("Superseded detail")), { once: true });
    }));
    let stop = () => {};
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/triage"]); prepared.flush();
      await vi.waitFor(() => expect(signals.size).toBe(2));
      const observer = new QueryObserver(prepared.client, { queryKey: ["comments", "old"] }); stop = observer.subscribe(() => {});
      await prepared.client.fetchQuery({ queryKey: ["issues", "new"], queryFn: async () => [{ ...old, id: "new" }], staleTime: 0 });
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "old"]))).toBe(false);
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "new"]))).toBe(true);
      expect(signals.get("/api/issues/old/comments")!.aborted).toBe(false);
      expect(signals.get("/api/issues/old/events")!.aborted).toBe(true);
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      prepared.fetch.mockImplementation(async () => Response.json([])); finish();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0)); await drain(prepared);
      expect(prepared.fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/issues/old/comments", "/api/issues/old/events", "/api/issues/new/comments", "/api/issues/new/events",
      ]);
      expect(prepared.tasks.size).toBe(0);
    } finally { stop(); finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("does not discover speculative details from manual optimistic list notifications", async () => {
    const prepared = setup();
    for (const option of appTabPreparationQueries(prepared.client, "/projects/new/triage")) prepared.client.setQueryData(option.queryKey, []);
    const old = { id: "old", project_id: "new", status: "triage", created_at: "2026-01-01" };
    prepared.client.setQueryData(["issues", "new"], [old]); prepared.fetch.mockImplementation(async () => Response.json([]));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/triage"]); await drain(prepared);
      expect(prepared.fetch).toHaveBeenCalledTimes(2);
      prepared.client.setQueryData(["issues", "new"], [{ ...old, id: "pending", created_at: "2026-01-02" }, old]);
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      expect(isPreparedAppTabDestination(prepared.client, "/projects/new/triage")).toBe(false);
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "pending"]))).toBe(false);
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "old"]))).toBe(true);
      prepared.client.setQueryData(["issues", "new"], [old]);
      expect(isPreparedAppTabDestination(prepared.client, "/projects/new/triage")).toBe(true);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("keeps a denied selected detail unprepared without retrying it on list reconciliation or focus", async () => {
    const foreground = new EventTarget(); vi.stubGlobal("window", foreground);
    const prepared = setup();
    for (const option of appTabPreparationQueries(prepared.client, "/projects/new/triage")) prepared.client.setQueryData(option.queryKey, []);
    const issue = { id: "denied", project_id: "new", status: "triage", created_at: "2026-01-01" };
    prepared.client.setQueryData(["issues", "new"], [issue]);
    prepared.fetch.mockImplementation(async (url) => String(url).endsWith("/comments")
      ? Response.json({ error: "Forbidden" }, { status: 403 }) : Response.json([]));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/triage"]); await drain(prepared);
      expect(prepared.client.getQueryState(["comments", "denied"])?.status).toBe("error");
      expect(navigationWorkingSetQueryHashes(prepared.client).has(hashKey(["comments", "denied"]))).toBe(true);
      expect(isPreparedAppTabDestination(prepared.client, "/projects/new/triage")).toBe(false);
      await prepared.client.fetchQuery({ queryKey: ["issues", "new"], queryFn: async () => [issue], staleTime: 0 });
      for (let step = 0; step < 3; step++) { foreground.dispatchEvent(new Event("focus")); prepared.flush(); }
      expect(prepared.fetch).toHaveBeenCalledTimes(2); expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });
  it("saturates two normal slots and refills only the slot whose shared query settles", async () => {
    const prepared = setup();
    const reads = new Map<string, { signal: AbortSignal; finish: () => void }>();
    prepared.fetch.mockImplementation((url, init) => new Promise((resolve, reject) => {
      const path = String(url), signal = init!.signal!;
      reads.set(path, { signal, finish: () => resolve(fixtureResponse(path)) });
      signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(reads.size).toBe(2));
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      reads.get("/api/projects/new/categories")!.finish();
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1)); prepared.flush();
      await vi.waitFor(() => expect(reads.size).toBe(3));
      expect(prepared.client.isFetching()).toBe(2);
      expect(reads.get("/api/projects/new/issues")!.signal.aborted).toBe(false);
      expect([...reads.keys()]).toEqual(["/api/projects/new/issues", "/api/projects/new/categories", "/api/projects/new/members"]);
      prepared.preparation.dispose();
      expect(reads.get("/api/projects/new/issues")!.signal.aborted).toBe(true);
      expect(reads.get("/api/projects/new/members")!.signal.aborted).toBe(true);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("starts an explicit Page body beside the held first project issue read and then admits its exact tree", async () => {
    const prepared = setup();
    const reads = new Map<string, { signal: AbortSignal; finish: () => void }>();
    prepared.fetch.mockImplementation((url, init) => new Promise((resolve, reject) => {
      const path = String(url), signal = init!.signal!;
      reads.set(path, { signal, finish: () => resolve(fixtureResponse(path)) });
      signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new", "/projects/new/pages/page"]); prepared.flush();
      await vi.waitFor(() => expect(reads.size).toBe(2));
      expect([...reads.keys()]).toEqual(["/api/projects/new/issues", "/api/projects/new/pages/page"]);
      reads.get("/api/projects/new/pages/page")!.finish();
      await vi.waitFor(() => { prepared.flush(); expect(reads.size).toBe(3); });
      expect([...reads.keys()]).toEqual(["/api/projects/new/issues", "/api/projects/new/pages/page", "/api/projects/new/pages"]);
      expect(prepared.client.isFetching()).toBe(SCOPED_PREPARATION_CONCURRENCY);
      expect(reads.get("/api/projects/new/issues")!.signal.aborted).toBe(false);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      reads.get("/api/projects/new/issues")!.finish(); reads.get("/api/projects/new/pages")!.finish();
      await drain(prepared);
      const paths = prepared.fetch.mock.calls.map(([url]) => String(url));
      expect(paths).toHaveLength(9);
      expect(new Set(paths).size).toBe(9);
      expect(paths.slice(3)).toEqual(["/api/projects/new/categories", "/api/projects/new/members",
        "/api/projects/new/objectives", "/api/projects/new/issue-relations", "/api/projects/new/integrations", "/api/projects/new/views"]);
    } finally { prepared.preparation.dispose(); for (const read of reads.values()) read.finish(); prepared.client.clear(); }
  });

  it("prefixes only the first listed explicit Page and keeps a denied body terminal until another visit", async () => {
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    vi.stubGlobal("document", surface);
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => String(url).endsWith("/pages/page")
      ? Response.json({ error: "Forbidden" }, { status: 403 })
      : String(url).endsWith("/pages/later") ? Response.json({ id: "later", project_id: "new", version: 1, content: { type: "doc", content: [] } })
        : fixtureResponse(String(url)));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new", "/projects/new/pages/page", "/projects/new/pages/later"]);
      await drain(prepared);
      const paths = prepared.fetch.mock.calls.map(([url]) => String(url));
      expect(paths.slice(0, 3)).toEqual(["/api/projects/new/issues", "/api/projects/new/pages/page", "/api/projects/new/pages"]);
      expect(paths.at(-1)).toBe("/api/projects/new/pages/later");
      expect(new Set(paths).size).toBe(10);
      expect(paths).toHaveLength(10);
      expect(prepared.client.getQueryState(pageKey("page"))?.status).toBe("error");
      const count = prepared.fetch.mock.calls.length;
      surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
      surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange")); prepared.flush();
      expect(prepared.fetch).toHaveBeenCalledTimes(count);
      expect(isPreparedPageData("page", prepared.client.getQueryState(pageKey("page"))!.dataUpdatedAt)).toBe(false);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("yields the prefixed Page and anchored project while hidden and resumes their exact reads after cancellation", async () => {
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    vi.stubGlobal("document", surface);
    const prepared = setup();
    const reads: Array<{ path: string; signal: AbortSignal; finish: () => void }> = [];
    prepared.fetch.mockImplementation((url, init) => new Promise((resolve) => {
      const path = String(url), signal = init!.signal!;
      // Keep transport pending after cancellation to model an admitted response.
      reads.push({ path, signal, finish: () => resolve(fixtureResponse(path)) });
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new", "/projects/new/pages/page"]); prepared.flush();
      await vi.waitFor(() => expect(reads).toHaveLength(2));
      expect(reads.map((read) => read.path)).toEqual(["/api/projects/new/issues", "/api/projects/new/pages/page"]);
      surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
      expect(reads.every((read) => read.signal.aborted)).toBe(true);
      prepared.flush(); expect(reads).toHaveLength(2);
      for (const read of reads) read.finish();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1));
      await drain(prepared);
      expect(prepared.fetch.mock.calls.slice(2, 4).map(([url]) => String(url))).toEqual(["/api/projects/new/issues", "/api/projects/new/pages/page"]);
      expect(prepared.client.getQueryState(pageKey("page"))?.status).toBe("success");
      expect(prepared.fetch).toHaveBeenCalledTimes(11);
    } finally { prepared.preparation.dispose(); for (const read of reads) read.finish(); prepared.client.clear(); }
  });

  it("preserves a joined foreground slot, cancels its sibling and blocks refills until foreground settles", async () => {
    const prepared = setup();
    const reads = new Map<string, { signal: AbortSignal; finish: () => void }>();
    prepared.fetch.mockImplementation((url, init) => new Promise((resolve, reject) => {
      const path = String(url), signal = init!.signal!;
      reads.set(path, { signal, finish: () => resolve(fixtureResponse(path)) });
      signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
    }));
    let stop = () => {};
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(reads.size).toBe(2));
      const observer = new QueryObserver(prepared.client, { queryKey: ["issues", "new"] });
      stop = observer.subscribe(() => {});
      expect(reads.get("/api/projects/new/issues")!.signal.aborted).toBe(false);
      expect(reads.get("/api/projects/new/categories")!.signal.aborted).toBe(true);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(1));
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      reads.get("/api/projects/new/issues")!.finish();
      await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe("success"));
      await drain(prepared);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/issues"))).toHaveLength(1);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/categories"))).toHaveLength(2);
      expect(navigationPreparationPending(prepared.client)).toBe(false);
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("cancels both unobserved slots for unknown foreground and resumes their exact prerequisites", async () => {
    const prepared = setup(); const signals: AbortSignal[] = [];
    prepared.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      const signal = init!.signal!; signals.push(signal);
      signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
    }));
    let finish!: () => void;
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signals).toHaveLength(2));
      const foreground = prepared.client.fetchQuery({ queryKey: ["explicit-overlay"], queryFn: () => new Promise((resolve) => { finish = () => resolve("ready"); }) });
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(1));
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      finish(); await foreground; await drain(prepared);
      expect(prepared.fetch).toHaveBeenCalledTimes(9);
      expect(prepared.client.getQueryState(["issues", "new"])?.status).toBe("success");
      expect(prepared.client.getQueryState(["categories", "new"])?.status).toBe("success");
    } finally { finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("retries a shared normal read canceled when its joining observer leaves", async () => {
    const prepared = setup(); let signal!: AbortSignal;
    prepared.fetch.mockImplementation((url, init) => String(url).endsWith("/new/issues")
      ? new Promise((_resolve, reject) => {
        signal = init!.signal!;
        signal.addEventListener("abort", () => reject(new Error("Foreground left")), { once: true });
      }) : Promise.resolve(fixtureResponse(String(url))));
    let stop = () => {};
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      const observer = new QueryObserver(prepared.client, { queryKey: ["issues", "new"] });
      stop = observer.subscribe(() => {});
      expect(signal.aborted).toBe(false);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      stop();
      expect(signal.aborted).toBe(true);
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1)); await drain(prepared);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/issues"))).toHaveLength(2);
      expect(prepared.client.getQueryState(["issues", "new"])?.status).toBe("success");
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("retries an invalidated cached Page after a joined observer leaves without certifying the reverted body", async () => {
    const prepared = setup(); const id = "cached-cancel-page", key = pageKey(id);
    const canonical = { id, project_id: "new", version: 1, content: { type: "doc", content: [] } };
    let signal!: AbortSignal; let stop = () => {};
    prepared.fetch.mockResolvedValueOnce(Response.json(canonical));
    await prepared.client.fetchQuery({ queryKey: key,
      queryFn: ({ signal: current }) => fetchPageNavigationData(prepared.client, "new", id, current) });
    await prepared.client.invalidateQueries({ queryKey: key, exact: true, refetchType: "none" });
    prepared.fetch.mockImplementation((url, init) => String(url).endsWith(`/pages/${id}`)
      ? new Promise((_resolve, reject) => {
        signal = init!.signal!;
        signal.addEventListener("abort", () => reject(new Error("Foreground left")), { once: true });
      }) : Promise.resolve(fixtureResponse(String(url))));
    try {
      prepared.preparation.visit("/home", ["/home", `/projects/new/pages/${id}`]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      const observer = new QueryObserver(prepared.client, { queryKey: key }); stop = observer.subscribe(() => {});
      expect(signal.aborted).toBe(false); stop(); expect(signal.aborted).toBe(true);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.client.getQueryData(key)).toEqual(canonical);
      expect(prepared.client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(isPreparedPageData(id, prepared.client.getQueryState(key)!.dataUpdatedAt)).toBe(false);
      prepared.fetch.mockImplementation(async (url) => String(url).endsWith(`/pages/${id}`)
        ? Response.json({ ...canonical, version: 2 }) : fixtureResponse(String(url)));
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1)); await drain(prepared);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith(`/pages/${id}`))).toHaveLength(3);
      expect(prepared.client.getQueryData(key)).toEqual({ ...canonical, version: 2 });
      expect(prepared.client.getQueryState(key)?.isInvalidated).toBe(false);
      expect(isPreparedPageData(id, prepared.client.getQueryState(key)!.dataUpdatedAt)).toBe(true);
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("holds navigation priority through the last normal read and keeps optional neighbors behind it", async () => {
    const prepared = setup(); let finish!: () => void;
    prepared.client.setQueryData(["projects"], [{ id: "new" }, { id: "neighbor" }]);
    for (const options of appTabPreparationQueries(prepared.client, "/projects/new")) {
      if (options.queryKey[0] !== "views") prepared.client.setQueryData(options.queryKey, []);
    }
    prepared.fetch.mockImplementation((url) => String(url).endsWith("/new/views")
      ? new Promise((resolve) => { finish = () => resolve(fixtureResponse(String(url))); })
      : Promise.resolve(fixtureResponse(String(url))));
    try {
      prepared.preparation.visit("/all", ["/all", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(finish).toBeDefined());
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(1);
      expect(navigationPreparationPending(prepared.client)).toBe(true);
      finish(); await drain(prepared);
      expect(navigationPreparationPending(prepared.client)).toBe(false);
      expect(prepared.fetch.mock.calls.slice(1).every(([url]) => String(url).startsWith("/api/projects/neighbor/"))).toBe(true);
      expect(prepared.fetch).toHaveBeenCalledTimes(8);
    } finally { finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it.each(["hidden", "offline"])("yields both slots while %s and resumes only after the account can prepare again", async (condition) => {
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    vi.stubGlobal("document", surface);
    const prepared = setup(); const signals: AbortSignal[] = [];
    prepared.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      const signal = init!.signal!; signals.push(signal);
      signal.addEventListener("abort", () => reject(new Error("Speculation yielded")), { once: true });
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signals).toHaveLength(2));
      if (condition === "hidden") { surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange")); }
      else onlineManager.setOnline(false);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      prepared.flush(); expect(prepared.fetch).toHaveBeenCalledTimes(2);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      if (condition === "hidden") { surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange")); }
      else onlineManager.setOnline(true);
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1));
      await drain(prepared);
      expect(prepared.fetch).toHaveBeenCalledTimes(9);
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); onlineManager.setOnline(true); }
  });

  it("serializes forge reads while a normal slot progresses without allowing a third request", async () => {
    const prepared = setup(); let finishForge!: () => void;
    let forgeActive = 0, maximumForge = 0, active = 0, maximum = 0;
    prepared.fetch.mockImplementation(async (url) => {
      const path = String(url); maximum = Math.max(maximum, ++active);
      if (path.startsWith("/api/pull-requests/")) {
        maximumForge = Math.max(maximumForge, ++forgeActive);
        if (path.endsWith("/one")) await new Promise<void>((resolve) => { finishForge = resolve; });
        forgeActive--; active--; return Response.json({ pr: { headSha: "head" } });
      }
      await Promise.resolve(); active--; return fixtureResponse(path);
    });
    try {
      // Earlier visits deliberately rank the explicit PR above the board.
      const tabs = ["/home", "/pull-requests?pr=one", "/pull-requests?pr=two", "/projects/new"];
      prepared.preparation.visit(tabs[1], tabs); prepared.preparation.visit(tabs[0], tabs); prepared.flush();
      await vi.waitFor(() => expect(finishForge).toBeDefined());
      for (let step = 0; step < 8; step++) {
        await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(1)); prepared.flush();
      }
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"))).toHaveLength(1);
      expect(prepared.client.getQueryState(["views", "new"])?.status).toBe("success");
      expect(maximum).toBe(SCOPED_PREPARATION_CONCURRENCY);
      finishForge(); await drain(prepared);
      expect(maximumForge).toBe(1);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual([
        "/api/pull-requests/one", "/api/pull-requests/two",
      ]);
    } finally { finishForge?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("admits only exact healthy cached passive summaries and metadata, without granting freshness", () => {
    const prepared = setup();
    try {
      const keys = [["me", "summary"], ["me", "triage-counts"], ["me", "smart-assign-warnings"],
        ["me", "branch-cleanup-targets"], ["pull-requests", "open-count"], ["app-tab-metadata", "owner", ["/projects/p/pages/a"]]];
      for (const key of keys) {
        prepared.client.setQueryData(key, []);
        const query = prepared.client.getQueryCache().find({ queryKey: key, exact: true })!;
        expect(isPassiveShellMaintenanceRead(query)).toBe(true);
        query.setState({ isInvalidated: true });
        expect(isPassiveShellMaintenanceRead(query)).toBe(true);
        expect(query.state.isInvalidated).toBe(true);
        query.setState({ status: "error", error: new Error("Unavailable") });
        expect(isPassiveShellMaintenanceRead(query)).toBe(false);
      }
      for (const key of [["me", "summary", "detail"], ["me", "search-index"], ["billing", "usage"], ["notifications"],
        ["agent-sessions", "all"], ["project-drafts"], ["projects"], ["page", "body"], ["pull-request", "id"],
        ["app-tab-metadata", "owner"], ["app-tab-metadata", "owner", { locations: [] }]]) {
        prepared.client.setQueryData(key, []);
        expect(isPassiveShellMaintenanceRead(prepared.client.getQueryCache().find({ queryKey: key, exact: true })!)).toBe(false);
      }
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("drains at most two scoped reads during healthy shell maintenance without canceling authorized reads", async () => {
    const prepared = setup(); let release!: () => void; let scoped = 0, maximum = 0;
    prepared.client.setQueryData(["me", "summary"], { counts: { total: 1 } });
    const maintenance = prepared.client.fetchQuery({ queryKey: ["me", "summary"], queryFn: () => new Promise((resolve) => { release = () => resolve({ counts: { total: 2 } }); }) });
    prepared.fetch.mockImplementation(async (url) => {
      maximum = Math.max(maximum, ++scoped); await Promise.resolve(); scoped--; return fixtureResponse(String(url));
    });
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]);
      for (let index = 0; index < 4; index++) {
        prepared.flush();
        const completed = Math.min((index + 1) * 2, 7);
        await vi.waitFor(() => expect(prepared.fetch.mock.calls.length).toBe(completed));
        await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(1));
      }
      expect(maximum).toBe(SCOPED_PREPARATION_CONCURRENCY); expect(prepared.client.getQueryState(["me", "summary"])?.fetchStatus).toBe("fetching");
      expect(prepared.client.getQueryData(["me", "summary"])).toEqual({ counts: { total: 1 } });
      release(); await maintenance; await drain(prepared);
      expect(prepared.client.getQueryData(["me", "summary"])).toEqual({ counts: { total: 2 } });
    } finally { release?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it.each(["missing", "failed"])("keeps %s shell summaries ahead of speculation", async (condition) => {
    const prepared = setup(); let release!: () => void;
    if (condition === "failed") {
      prepared.client.setQueryData(["me", "summary"], { counts: { total: 1 } });
      await prepared.client.fetchQuery({ queryKey: ["me", "summary"], queryFn: () => { throw new Error("Unavailable"); } }).catch(() => {});
    }
    const required = prepared.client.fetchQuery({ queryKey: ["me", "summary"], queryFn: () => new Promise((resolve) => { release = () => resolve({ counts: { total: 2 } }); }) });
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      expect(prepared.fetch).not.toHaveBeenCalled();
      release(); await required;
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url))); await drain(prepared);
      expect(prepared.fetch).toHaveBeenCalledTimes(7);
    } finally { release?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("preserves a scoped read through passive maintenance churn but yields to explicit search and unknown foreground reads", async () => {
    const prepared = setup(); let signal!: AbortSignal; let finish!: () => void;
    prepared.fetch.mockImplementationOnce((_url, init) => new Promise((resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
      finish = () => resolve(fixtureResponse("/api/projects/new/issues"));
    }));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      prepared.client.setQueryData(["me", "triage-counts"], { counts: {} });
      for (let index = 0; index < 3; index++) await prepared.client.fetchQuery({ queryKey: ["me", "triage-counts"], queryFn: async () => ({ counts: {} }) });
      expect(signal.aborted).toBe(false);
      await prepared.client.fetchQuery({ queryKey: ["me", "search-index"], queryFn: async () => ({ issues: [] }) });
      expect(signal.aborted).toBe(true);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url))); await drain(prepared);
      expect(prepared.client.getQueryState(["issues", "new"])?.status).toBe("success");
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/issues"))).toHaveLength(2);
    } finally { finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("prepares every unique prerequisite in the representative ten-tab set without activation", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => {
      const path = String(url);
      const page = path.match(/\/projects\/([^/]+)\/pages\/([^/]+)$/);
      return page ? Response.json({ id: page[2], project_id: page[1], version: 1, content: { type: "doc", content: [] } }) : fixtureResponse(path);
    });
    const tabs = ["/all", "/projects/new", "/projects/new/pages/a", "/projects/other/pages/b", "/home",
      "/pull-requests?pr=one", "/routines", "/projects/new/triage", "/projects/new/feedback", "/projects/new/objectives"];
    try {
      prepared.preparation.visit(tabs[0], tabs);
      expect(new Set(vi.mocked(prepareAppTabSurface).mock.calls.map(([href]) => href))).toEqual(new Set(tabs));
      await drain(prepared);
      for (const href of tabs.slice(1)) for (const options of appTabPreparationQueries(prepared.client, href)) {
        expect(prepared.client.getQueryState(options.queryKey)?.status, `${href}: ${JSON.stringify(options.queryKey)}`).toBe("success");
      }
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/issues"))).toHaveLength(1);
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/new/objectives"))).toHaveLength(1);
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("warms every listed bundle even while foreground transport prevents speculative reads", async () => {
    const prepared = setup(); let finish!: () => void;
    const pending = prepared.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise((resolve) => { finish = () => resolve("ready"); }) });
    try {
      const tabs = ["/all", "/projects/new", "/routines", "/projects/new/objectives"];
      prepared.preparation.visit(tabs[0], tabs); prepared.flush();
      expect(new Set(vi.mocked(prepareAppTabSurface).mock.calls.map(([href]) => href))).toEqual(new Set(tabs));
      expect(prepared.fetch).not.toHaveBeenCalled();
      finish(); await pending;
    } finally { finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("retries an interrupted listed read after foreground work settles without another activation", async () => {
    const prepared = setup(); let signal!: AbortSignal;
    prepared.fetch.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    }));
    let finish!: () => void;
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/pages/page"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      const pending = prepared.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise((resolve) => { finish = () => resolve("ready"); }) });
      expect(signal.aborted).toBe(true); prepared.flush();
      expect(prepared.fetch).toHaveBeenCalledTimes(SCOPED_PREPARATION_CONCURRENCY);
      prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
      finish(); await pending; await drain(prepared);
      expect(prepared.client.getQueryState(["page", "page"])?.status).toBe("success");
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).endsWith("/pages/page"))).toHaveLength(2);
    } finally { finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("reconciles invalidated inactive tabs after visibility resumes without a new navigation", async () => {
    const prepared = setup();
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    const foreground = new EventTarget();
    vi.stubGlobal("document", surface); vi.stubGlobal("window", foreground);
    // Recreate the owner after installing lifecycle surfaces.
    prepared.preparation.dispose();
    const tasks = prepared.tasks;
    const preparation = createPrTabPreparation(prepared.client, (task) => { tasks.add(task); return () => { tasks.delete(task); }; });
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    try {
      preparation.visit("/home", ["/home", "/projects/new"]); await drain({ ...prepared, preparation });
      expect(prepared.fetch).toHaveBeenCalledTimes(7);
      surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
      await prepared.client.invalidateQueries({ queryKey: ["issues", "new"], refetchType: "none" }); prepared.flush();
      expect(prepared.fetch).toHaveBeenCalledTimes(7);
      surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange")); foreground.dispatchEvent(new Event("focus"));
      await drain({ ...prepared, preparation });
      expect(prepared.fetch).toHaveBeenCalledTimes(8);
      expect(prepared.client.getQueryState(["issues", "new"])?.isInvalidated).toBe(false);
    } finally { preparation.dispose(); prepared.client.clear(); }
  });

  it("does not retry a denied missing Page during repeated focus or visibility resumes", async () => {
    const surface = new EventTarget() as EventTarget & { visibilityState: string; querySelectorAll: () => [] };
    surface.visibilityState = "visible"; surface.querySelectorAll = () => [];
    const foreground = new EventTarget();
    vi.stubGlobal("document", surface); vi.stubGlobal("window", foreground);
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => String(url).endsWith("/pages/page")
      ? Response.json({ error: "Forbidden" }, { status: 403 }) : fixtureResponse(String(url)));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new/pages/page"]); await drain(prepared);
      expect(prepared.client.getQueryState(["page", "page"])?.status).toBe("error");
      const reads = prepared.fetch.mock.calls.length;
      for (let index = 0; index < 3; index++) {
        foreground.dispatchEvent(new Event("focus"));
        surface.visibilityState = "hidden"; surface.dispatchEvent(new Event("visibilitychange"));
        surface.visibilityState = "visible"; surface.dispatchEvent(new Event("visibilitychange"));
        prepared.flush();
      }
      expect(prepared.fetch).toHaveBeenCalledTimes(reads);
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("ignores unrelated cache and observer churn after the finite working set completes", async () => {
    const prepared = setup(); prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    try {
      prepared.preparation.visit("/home", ["/home", "/projects/new"]); await drain(prepared);
      expect(prepared.tasks.size).toBe(0);
      const observer = new QueryObserver(prepared.client, { queryKey: ["unrelated"], enabled: false });
      const stop = observer.subscribe(() => {});
      prepared.client.setQueryData(["unrelated"], "changed"); stop();
      await prepared.client.fetchQuery({ queryKey: ["another"], queryFn: async () => "ready" });
      expect(prepared.tasks.size).toBe(0);
      expect(prepared.fetch).toHaveBeenCalledTimes(7);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

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
  it("warms all seven neighboring project prerequisites alongside an open board and Page within two normal read slots", async () => {
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
      expect(maximum).toBe(SCOPED_PREPARATION_CONCURRENCY);
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
      expect(prepared.fetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/projects/new/pages/page", "/api/projects/new/pages", "/api/projects/new/issues", "/api/projects/new/members", "/api/projects/new/objectives",
      ]);
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
    prepared.fetch.mockImplementation((url, init) => String(url).endsWith("/neighbor/issues")
      ? new Promise((resolve) => { signal = init!.signal!; finish = () => resolve(Response.json([])); })
      : Promise.resolve(fixtureResponse(String(url))));
    let stop = () => {};
    try {
      prepared.preparation.visit("/projects/new", ["/projects/new"]); prepared.flush();
      await vi.waitFor(() => expect(signal).toBeDefined());
      const observer = new QueryObserver(prepared.client, { queryKey: ["issues", "neighbor"] }); stop = observer.subscribe(() => {});
      prepared.preparation.dispose(); expect(signal.aborted).toBe(false);
      finish(); await vi.waitFor(() => expect(observer.getCurrentResult().status).toBe("success"));
    } finally { stop(); finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("warms every prerequisite of never-visited open project and Page tabs within two scoped read slots", async () => {
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
      "/api/projects/new/issues", "/api/projects/new/pages/page", "/api/projects/new/pages",
      "/api/projects/new/categories", "/api/projects/new/members",
      "/api/projects/new/objectives", "/api/projects/new/issue-relations", "/api/projects/new/integrations",
      "/api/projects/new/views",
    ]);
    expect(maximum).toBe(SCOPED_PREPARATION_CONCURRENCY);
    expect(prepared.client.getQueryData(["views", "new"])).toEqual([]);
    prepared.flush(); expect(prepared.tasks.size).toBe(0);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("bounds large accounts at ten listed tabs and finishes their boards before PR reads", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", "/pull-requests?pr=unvisited", "/pull-requests?pr=another",
      ...Array.from({ length: 20 }, (_, index) => `/projects/p${index}`)]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(63);
    const details = prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"));
    expect(details).toHaveLength(0);
    expect(prepared.fetch.mock.calls.every(([url]) => /^\/api\/projects\/p[0-8]\//.test(String(url)))).toBe(true);
    expect(prepared.fetch.mock.calls.some(([url]) => String(url).includes("/projects/p9/"))).toBe(false);
    expect(prepared.tasks.size).toBe(0);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("completes all prerequisites of nine inactive boards without preparing an eleventh tab", async () => {
    const prepared = setup();
    prepared.fetch.mockImplementation(async (url) => fixtureResponse(String(url)));
    prepared.preparation.visit("/home", ["/home", ...Array.from({ length: 20 }, (_, index) => `/projects/p${index}`)]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(63);
    expect(prepared.fetch.mock.calls.every(([url]) => /^\/api\/projects\/p[0-8]\//.test(String(url)))).toBe(true);
    expect(prepared.tasks.size).toBe(0);
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
      await vi.waitFor(() => { if (!signal) expect(prepared.client.isFetching()).toBe(0); });
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
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/"))).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/pull-requests/late2");
    await drain({ client, preparation, flush, fetch, tasks });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual([
      "/api/pull-requests/late2", "/api/pull-requests/late1", "/api/pull-requests/early",
    ]);
    expect(tasks.size).toBe(0);
    preparation.visit(hrefs[0], hrefs); flush();
    await drain({ client, preparation, flush, fetch, tasks });
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual(["/api/pull-requests/late2", "/api/pull-requests/late1", "/api/pull-requests/early"]);
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
    const { client, preparation, flush, fetch, tasks } = setup();
    const error = new ApiError("Limited"); error.status = 429; error.retryAt = Date.now() + 60_000;
    await client.fetchQuery({ queryKey: ["pull-request", "limited"], queryFn: async () => { throw error; } }).catch(() => {});
    const hrefs = ["/home", "/pull-requests?pr=late"];
    preparation.visit(hrefs[1], hrefs); preparation.visit(hrefs[0], hrefs); flush();
    expect(fetch).not.toHaveBeenCalled();
    await client.fetchQuery(pullRequestQueryOptions("other")).catch(() => {});
    // A real completion may wake the parked identity once; Retry-After keeps
    // it parked again without scheduling an idle retry loop or another request.
    await new Promise((resolve) => setTimeout(resolve, 0)); flush();
    for (let step = 0; step < 3; step++) flush();
    expect(tasks.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled(); preparation.dispose(); client.clear();
  });

  it("parks a displayed PR while an external helper settles and resumes it without another visit", async () => {
    const prepared = setup(); let finish!: () => void;
    let active = 0, maximum = 0;
    prepared.fetch.mockImplementation(async (url) => {
      const path = String(url); maximum = Math.max(maximum, ++active);
      if (path.endsWith("/external")) await new Promise<void>((resolve) => { finish = resolve; });
      active--; return Response.json({ pr: { headSha: "head" } });
    });
    const external = prefetchPullRequestDetail(prepared.client, "external")!;
    // Exercise the real cache event ordering: the helper is still held while
    // its query emits success, even though the transport is no longer fetching.
    const stop = prepared.client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryKey[1] === "external" && event.action.type === "success") prepared.flush();
    });
    try {
      prepared.preparation.visit("/home", ["/home", "/pull-requests?pr=listed"]); prepared.flush();
      await vi.waitFor(() => expect(finish).toBeDefined());
      expect(prepared.fetch).toHaveBeenCalledTimes(1);
      finish(); await external;
      expect(prepared.client.getQueryData(["pull-request", "listed"])).toBeUndefined();
      expect(prepared.tasks.size).toBe(0);
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1)); await drain(prepared);
      expect(prepared.client.getQueryState(["pull-request", "listed"])?.status).toBe("success");
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual([
        "/api/pull-requests/external", "/api/pull-requests/listed",
      ]);
      expect(maximum).toBe(1);
      expect(prepared.tasks.size).toBe(0);
    } finally { stop(); finish?.(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("resumes a listed PR after a cached external hover releases its helper without transport events", async () => {
    const prepared = setup();
    prepared.client.setQueryData(["pull-request", "external"], { pr: { headSha: "head" } });
    const external = prefetchPullRequestDetail(prepared.client, "external")!;
    try {
      prepared.preparation.visit("/home", ["/home", "/pull-requests?pr=listed"]); prepared.flush();
      expect(prepared.fetch).not.toHaveBeenCalled(); expect(prepared.tasks.size).toBe(0);
      await external;
      await vi.waitFor(() => expect(prepared.tasks.size).toBe(1)); await drain(prepared);
      expect(prepared.client.getQueryState(["pull-request", "listed"])?.status).toBe("success");
      expect(prepared.fetch.mock.calls.filter(([url]) => String(url).startsWith("/api/pull-requests/")).map(([url]) => url)).toEqual([
        "/api/pull-requests/listed",
      ]);
      expect(prepared.tasks.size).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
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
