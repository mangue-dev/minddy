// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { PrBackgroundSync } from "./use-pr-background";
import { ApiError } from "./agent-api";
import { allPullRequestsQueryKey } from "./use-agent-runs";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
const live = vi.hoisted(() => vi.fn());
vi.mock("./use-pr-live", () => ({ usePrLive: live }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); live.mockClear(); focusManager.setFocused(undefined); });

async function setup() {
  vi.useFakeTimers(); focusManager.setFocused(true);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let ids = Array.from({ length: 10 }, (_, i) => `pr-${i}`);
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).startsWith("/api/pull-requests?")) return Response.json({ pullRequests: ids.map((prId) => ({ prId, pr_state: "open" })) });
    return Response.json({ pr: { headSha: String(url), state: "open" }, files: [] });
  });
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(document.createElement("div"));
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(PrBackgroundSync)));
    await vi.advanceTimersByTimeAsync(10);
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  return { client, fetch, setIds: (value: string[]) => { ids = value; },
    close: async () => { await act(() => root.unmount()); client.clear(); } };
}

it("maintains only five recent details and shares foreground/realtime reads", async () => {
  const view = await setup();
  try {
    expect(view.fetch.mock.calls.filter(([url]) => !String(url).includes("?")).length).toBe(5);
    expect(new Set(live.mock.calls.map(([id]) => id))).toEqual(new Set(Array.from({ length: 5 }, (_, i) => `pr-${i}`)));
    await act(async () => { await view.client.invalidateQueries({ queryKey: ["pull-request", "pr-0"] }); await vi.advanceTimersByTimeAsync(10); });
    expect(view.fetch.mock.calls.filter(([url]) => String(url) === "/api/pull-requests/pr-0").length).toBe(2);
    view.setIds(["new", "pr-0", "pr-1", "pr-2", "pr-3"]);
    await act(async () => { await view.client.invalidateQueries({ queryKey: allPullRequestsQueryKey() }); await vi.advanceTimersByTimeAsync(10); });
    const old = view.client.getQueryCache().find({ queryKey: ["pull-request", "pr-4"], exact: true });
    expect(old?.getObserversCount()).toBe(0);
    expect(view.client.getQueryCache().find({ queryKey: ["pull-request", "new"], exact: true })?.getObserversCount()).toBe(1);
    const start = view.fetch.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(view.fetch.mock.calls.slice(start).some(([url]) => String(url) === "/api/pull-requests/pr-4")).toBe(false);
    expect(view.fetch.mock.calls.slice(start).some(([url]) => String(url) === "/api/pull-requests/new")).toBe(true);
  } finally { await view.close(); }
});

it("respects account Retry-After before any new background network request", async () => {
  const view = await setup();
  try {
    const error = new ApiError("Quota exhausted"); error.status = 429; error.retryAt = Date.now() + 120_000;
    await view.client.fetchQuery({ queryKey: ["pr-comments", "other"], queryFn: async () => { throw error; } }).catch(() => {});
    const count = view.fetch.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(119_000); });
    expect(view.fetch).toHaveBeenCalledTimes(count);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(view.fetch.mock.calls.length).toBeGreaterThan(count);
  } finally { await view.close(); }
});
