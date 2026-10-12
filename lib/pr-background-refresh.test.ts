import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPrBackgroundRefresh } from "./pr-background-refresh";
import { pullRequestQueryOptions } from "./pull-request-query";
import { ApiError } from "./agent-api";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); onlineManager.setOnline(true); });

function setup() {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ids = Array.from({ length: 8 }, (_, index) => `pr-${index}`);
  for (const id of ids) client.setQueryData(["pull-request", id], { pr: { state: "open" }, files: [] });
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ pr: { state: "open" }, files: [] }));
  vi.stubGlobal("fetch", fetch);
  const refresh = createPrBackgroundRefresh(client); refresh.update(ids);
  return { client, ids, fetch, refresh, close: () => { refresh.dispose(); client.clear(); } };
}

it("refreshes the same five live details sequentially instead of creating a periodic burst", async () => {
  const view = setup();
  let release!: () => void, concurrent = 0, maximum = 0;
  view.fetch.mockImplementation(() => new Promise((resolve) => {
    maximum = Math.max(maximum, ++concurrent);
    release = () => { concurrent--; resolve(Response.json({ pr: { state: "open" }, files: [] })); };
  }));
  try {
    await vi.advanceTimersByTimeAsync(60_100);
    expect(view.fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000); expect(view.fetch).toHaveBeenCalledOnce();
    for (let index = 0; index < 5; index++) {
      expect(view.fetch.mock.calls[index][0]).toBe(`/api/pull-requests/pr-${index}`);
      release(); await vi.advanceTimersByTimeAsync(100);
    }
    expect(view.fetch).toHaveBeenCalledTimes(5); expect(maximum).toBe(1);
    for (const id of view.ids.slice(0, 5)) expect(view.client.getQueryCache().find({ queryKey: ["pull-request", id] })?.getObserversCount()).toBe(1);
    view.refresh.update(["pr-7"]);
    expect(view.client.getQueryCache().find({ queryKey: ["pull-request", "pr-0"] })?.getObserversCount()).toBe(0);
  } finally { view.close(); }
});

it("aborts only its own periodic read when a foreground Page starts and resumes after it settles", async () => {
  const view = setup(); let signal!: AbortSignal;
  view.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  }));
  try {
    await vi.advanceTimersByTimeAsync(60_100); expect(signal.aborted).toBe(false);
    let complete!: () => void;
    const page = view.client.fetchQuery({ queryKey: ["page", "current"], queryFn: () => new Promise((resolve) => { complete = () => resolve("authorized body"); }) });
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(2000); expect(view.fetch).toHaveBeenCalledOnce();
    view.fetch.mockImplementation(async () => Response.json({ pr: {}, files: [] }));
    complete(); await page; await vi.advanceTimersByTimeAsync(600);
    expect(view.fetch.mock.calls.length).toBeGreaterThan(1);
    expect(view.fetch.mock.calls.filter(([url]) => String(url).endsWith("pr-0"))).toHaveLength(1);
  } finally { view.close(); }
});

it("preserves a foreground detail joining a periodic read through unrelated transport and account cleanup", async () => {
  const view = setup(); let signal!: AbortSignal, release!: () => void;
  view.fetch.mockImplementation((_url, init) => new Promise((resolve, reject) => {
    signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
    release = () => resolve(Response.json({ pr: {}, files: [] }));
  }));
  let stop = () => {};
  try {
    await vi.advanceTimersByTimeAsync(60_100);
    const foreground = new QueryObserver(view.client, pullRequestQueryOptions("pr-0"));
    stop = foreground.subscribe(() => {});
    await view.client.fetchQuery({ queryKey: ["page", "current"], queryFn: async () => "body" });
    expect(signal.aborted).toBe(false); view.refresh.dispose(); expect(signal.aborted).toBe(false);
    expect(view.fetch).toHaveBeenCalledOnce();
    release(); await vi.advanceTimersByTimeAsync(100);
    expect(foreground.getCurrentResult().status).toBe("success");
  } finally { stop(); view.close(); }
});

it("honors account Retry-After, hidden windows and offline pauses without a polling loop", async () => {
  const view = setup(); const doc = new EventTarget(); let hidden = true;
  Object.defineProperty(doc, "visibilityState", { get: () => hidden ? "hidden" : "visible" });
  vi.stubGlobal("document", doc);
  try {
    const error = new ApiError("Limited"); error.status = 429; error.retryAt = Date.now() + 120_000;
    await view.client.fetchQuery({ queryKey: ["pr-comments", "limited"], queryFn: () => { throw error; } }).catch(() => {});
    await vi.advanceTimersByTimeAsync(119_000); expect(view.fetch).not.toHaveBeenCalled();
    hidden = false; onlineManager.setOnline(false);
    await vi.advanceTimersByTimeAsync(5000); expect(view.fetch).not.toHaveBeenCalled();
    onlineManager.setOnline(true); await vi.advanceTimersByTimeAsync(600);
    expect(view.fetch).toHaveBeenCalledTimes(5);
  } finally { view.close(); }
});

it("backs off failed reads while retaining realtime invalidation of a healthy detail", async () => {
  const view = setup();
  view.fetch.mockImplementation(async (url) => String(url).endsWith("pr-0")
    ? Response.json({ error: "Missing" }, { status: 404 }) : Response.json({ pr: {}, files: [] }));
  try {
    await vi.advanceTimersByTimeAsync(60_600);
    expect(view.fetch).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(5000); expect(view.fetch).toHaveBeenCalledTimes(5);
    await view.client.invalidateQueries({ queryKey: ["pull-request", "pr-1"], exact: true });
    expect(view.fetch).toHaveBeenCalledTimes(6);
    expect(view.client.getQueryState(["pull-request", "pr-1"])?.status).toBe("success");
  } finally { view.close(); }
});
