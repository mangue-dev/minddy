import { feedbackQueryOptions } from "./feedback-query";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchAppTabDestination, appTabPreparationQueries, isPreparedAppTabDestination } from "./prefetch-tab-destination";
import { GLOBAL_BOARD_KEY } from "./optimistic/issue-writes";

vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(), isAppTabSurfaceReady: () => true }));

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));

const response = (data: unknown = {}) => Response.json(data);

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
  it("includes complete routines, objective and feedback prerequisites through shared consumer keys", () => {
    expect(appTabPreparationQueries(client, "/projects/p/pages/document").map((option) => option.queryKey)).toEqual([
      ["page", "document"], ["pages", "p"], ["issues", "p"], ["members", "p"], ["objectives", "p"],
    ]);
    expect(appTabPreparationQueries(client, "/routines?routine=one").map((option) => option.queryKey)).toEqual([
      ["routines"], ["agent-models"], ["routines", "one", "runs"],
    ]);
    expect(appTabPreparationQueries(client, "/projects/p/objectives").map((option) => option.queryKey)).toEqual([
      ["issues", "p"], ["members", "p"], ["objectives", "p"], ["issue-relations", "p"], ["pages", "p"],
    ]);
    expect(appTabPreparationQueries(client, "/projects/p/feedback").map((option) => option.queryKey)).toEqual([
      feedbackQueryOptions("p").queryKey, ["issues", "p"], ["categories", "p"], ["members", "p"], ["objectives", "p"], ["issue-relations", "p"], ["pages", "p"],
    ]);
  });

  it("resolves explicit scoped detail destinations without preparing every row or a closed setup wizard", () => {
    client.setQueryData(["issues", "p"], [
      { id: "recent", project_id: "p", status: "triage", created_at: "2026-01-02" },
      { id: "explicit", project_id: "p", status: "triage", created_at: "2026-01-01" },
      { id: "foreign", project_id: "other", status: "triage", created_at: "2026-01-03" },
    ]);
    client.setQueryData(["objectives", "p"], [
      { id: "first", project_id: "p", status: "planned" }, { id: "done", project_id: "p", status: "done" },
    ]);
    const posts = [{ id: "open", project_id: "p", status: "open", vote_count: 1, created_at: "2026-01-01", review_state: "published", sensitivity: null },
      { id: "archive", project_id: "p", status: "shipped", vote_count: 20, created_at: "2026-01-02", review_state: "published", sensitivity: null }];
    client.setQueryData(["feedback", "p"], { posts, board_enabled: false });
    const keys = (href: string) => appTabPreparationQueries(client, href).map((option) => option.queryKey);
    expect(keys("/projects/p/triage?issue=explicit")).toContainEqual(["comments", "explicit"]);
    expect(keys("/projects/p/triage?issue=foreign")).toContainEqual(["comments", "recent"]);
    expect(keys("/projects/p/objectives?open=done").slice(-4)).toEqual([
      ["objective-comments", "done"], ["objective-events", "done"], ["objective-resources", "done"], ["objective-feedback", "p", "done", "count"],
    ]);
    expect(keys("/projects/p/feedback?post=archive").slice(-3)).toEqual([
      ["feedback-detail", "p", "archive"], ["feedback-comments", "p", "archive"], ["feedback-events", "p", "archive"],
    ]);
    expect(keys("/projects/p/feedback?post=archive").some((key) => ["feedback-settings", "project-git-link"].includes(String(key[0])))).toBe(false);
  });

  it("requires every shared prerequisite before allowing retained local navigation", () => {
    client.setQueryData(["issues", "p"], []);
    expect(isPreparedAppTabDestination(client, "/projects/p")).toBe(false);
    for (const options of appTabPreparationQueries(client, "/projects/p")) client.setQueryData(options.queryKey, []);
    expect(isPreparedAppTabDestination(client, "/projects/p")).toBe(true);
    for (const href of ["/routines", "/projects/p/objectives"]) {
      for (const options of appTabPreparationQueries(client, href)) client.setQueryData(options.queryKey, []);
      expect(isPreparedAppTabDestination(client, href)).toBe(true);
    }
  });

  it("prepares Pages and Feedback through their actual consumer keys without board reads", async () => {
    fetchMock.mockImplementation(async () => response({ posts: [], board_enabled: false }));
    prefetchAppTabDestination(client, "/projects/p/pages", new Set());
    prefetchAppTabDestination(client, "/projects/p/feedback", new Set());
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    expect(requested().sort()).toEqual(["/api/projects/p/feedback", "/api/projects/p/pages"]);
    expect(client.getQueryData(feedbackQueryOptions("p").queryKey)).toEqual({ posts: [], board_enabled: false });
    prefetchAppTabDestination(client, "/projects/p/settings", new Set());
    expect(requested()).toHaveLength(2);
  });

  it("warms the routines list and the agent catalog once per destination", async () => {
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
    prefetchAppTabDestination(client, "/routines", new Set());
    await vi.waitFor(() => expect(requested()).toEqual(["/api/routines", "/api/agent/models"]));
  });

  it("maps project destinations to every retained board prerequisite", async () => {
    prefetchAppTabDestination(client, "/projects/p1?view=7", new Set());
    await vi.waitFor(() => expect(requested()).toEqual([
      "/api/projects/p1/issues",
      "/api/projects/p1/categories",
      "/api/projects/p1/members",
      "/api/projects/p1/objectives",
      "/api/projects/p1/issue-relations",
      "/api/projects/p1/integrations",
      "/api/projects/p1/views",
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
    await vi.waitFor(() => expect(client.getQueryData(["pull-request", "pr1"])).toEqual({ readSequence: expect.any(Number), readSession: expect.any(String) }));
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
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
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
    await vi.waitFor(() => expect(signal).toBeDefined());
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
