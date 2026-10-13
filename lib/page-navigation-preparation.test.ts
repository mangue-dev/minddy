// @vitest-environment jsdom

import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPageNavigationPreparation } from "./page-navigation-preparation";
import { fetchPageNavigationData, isPreparedPageData, pageKey, pagesKey } from "./use-pages-query";
import { forgetDraftPage, markDraftPage } from "./pages-draft";
import type { Page } from "./pages";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); onlineManager.setOnline(true); document.body.replaceChildren(); });

const body = (id: string, version = 1, project = "project") => ({ id, project_id: project, parent_id: null,
  position: id, version, database_schema: null, content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `Document ${version}` }] }] } }) as Page;
const href = (id: string) => `/projects/project/pages/${id}`;
function setup(ids = ["a"]) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-13T01:00:00Z"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = Array.from("abcdefgh", (id) => body(id));
  client.setQueryData(pagesKey("project"), tree);
  for (const id of ids) client.setQueryData(pageKey(id), body(id));
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => Response.json(body(String(url).split("/").at(-1)!)));
  vi.stubGlobal("fetch", fetch);
  const preparation = createPageNavigationPreparation(client);
  preparation.visit("/home", ["/home", ...ids.map(href)]);
  return { client, fetch, preparation, close: () => { preparation.dispose(); client.clear(); } };
}

it("prepares only one adjacent body and renews a bounded small-document working set before expiry", async () => {
  const view = setup(["a", "c", "e", "g"]);
  try {
    await vi.advanceTimersByTimeAsync(500);
    expect(view.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/projects/project/pages/h"]);
    await vi.advanceTimersByTimeAsync(16_000);
    const ids = new Set(view.fetch.mock.calls.map(([url]) => String(url).split("/").at(-1)));
    expect(ids).toEqual(new Set(["g", "h", "e"]));
    expect(view.client.getQueryState(pageKey("g"))?.status).toBe("success");
    expect(isPreparedPageData("g", view.client.getQueryState(pageKey("g"))!.dataUpdatedAt)).toBe(true);
    view.preparation.visit("/home", ["/home"]);
    const calls = view.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000); expect(view.fetch).toHaveBeenCalledTimes(calls);
  } finally { view.close(); }
});

it("stops renewal for validated retained surfaces and never repeats a large adjacent body", async () => {
  const view = setup();
  view.fetch.mockImplementation(async (url) => Response.json({ ...body(String(url).split("/").at(-1)!), content: { type: "doc", content: [{ type: "image" }] } }));
  const mounted = document.createElement("div"); mounted.dataset.pageSurfaceId = "a"; document.body.append(mounted);
  try {
    await vi.advanceTimersByTimeAsync(30_000);
    expect(view.fetch).toHaveBeenCalledOnce();
    expect(view.fetch.mock.calls[0][0]).toBe("/api/projects/project/pages/b");
  } finally { view.close(); }
});

it("yields an unobserved read to foreground work without granting a navigation lease", async () => {
  const view = setup(); let signal!: AbortSignal;
  view.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
    signal = init!.signal!; signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  }));
  try {
    await vi.advanceTimersByTimeAsync(500);
    let release!: () => void;
    const pending = view.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise((resolve) => { release = () => resolve("done"); }) });
    expect(signal.aborted).toBe(true);
    expect(isPreparedPageData("b", view.client.getQueryState(pageKey("b"))?.dataUpdatedAt ?? 0)).toBe(false);
    await vi.advanceTimersByTimeAsync(9000); expect(view.fetch).toHaveBeenCalledOnce();
    release(); await pending;
  } finally { view.close(); }
});

it("preserves a foreground observer joining the shared read when its account owner retires", async () => {
  const view = setup(); let signal!: AbortSignal, release!: () => void;
  view.fetch.mockImplementation((_url, init) => new Promise((resolve) => { signal = init!.signal!; release = () => resolve(Response.json(body("b"))); }));
  let stop = () => {};
  try {
    await vi.advanceTimersByTimeAsync(500);
    const observer = new QueryObserver(view.client, { queryKey: pageKey("b"), queryFn: ({ signal }) => fetchPageNavigationData(view.client, "project", "b", signal), staleTime: 10_000 });
    stop = observer.subscribe(() => {});
    view.preparation.dispose(); expect(signal.aborted).toBe(false);
    release(); await vi.advanceTimersByTimeAsync(1);
    expect(observer.getCurrentResult().data?.id).toBe("b");
  } finally { stop(); view.close(); }
});

it.each([401, 403, 404, 429])("stops speculative reads after HTTP %s until a real authorized success", async (status) => {
  const view = setup(["a"]);
  view.client.setQueryData(pageKey("b"), body("b"));
  view.fetch.mockImplementation(async () => Response.json({ error: "Unavailable" }, { status }));
  try {
    await vi.advanceTimersByTimeAsync(9000); const calls = view.fetch.mock.calls.length;
    expect(calls).toBe(2);
    view.client.setQueryData(pageKey("a"), body("a", 2));
    await vi.advanceTimersByTimeAsync(60_000); expect(view.fetch).toHaveBeenCalledTimes(calls);
    view.fetch.mockImplementation(async (url) => Response.json(body(String(url).split("/").at(-1)!, 3)));
    await view.client.fetchQuery({ queryKey: pageKey("a"), queryFn: ({ signal }) => fetchPageNavigationData(view.client, "project", "a", signal), staleTime: 0 });
    await vi.advanceTimersByTimeAsync(8500);
    expect(view.fetch.mock.calls.filter(([url]) => String(url).endsWith("/a"))).toHaveLength(3);
  } finally { view.close(); }
});

it("pauses while hidden or offline and disposes without another timer or lease", async () => {
  const view = setup(); const state = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  try {
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(20_000); expect(view.fetch).not.toHaveBeenCalled();
    state.mockReturnValue("visible"); onlineManager.setOnline(false); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(20_000); expect(view.fetch).not.toHaveBeenCalled();
    onlineManager.setOnline(true); await vi.advanceTimersByTimeAsync(1000); expect(view.fetch).toHaveBeenCalled();
    view.preparation.dispose(); const calls = view.fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000); expect(view.fetch).toHaveBeenCalledTimes(calls);
  } finally { state.mockRestore(); view.close(); }
});

it("rejects cross-project bodies and never replaces a newer accepted version with a late GET", async () => {
  const view = setup(); let release!: () => void;
  view.fetch.mockImplementation(() => new Promise((resolve) => { release = () => resolve(Response.json(body("a", 1))); }));
  try {
    const pending = fetchPageNavigationData(view.client, "project", "a");
    await vi.advanceTimersByTimeAsync(1);
    view.client.setQueryData(pageKey("a"), body("a", 2)); release();
    expect((await pending).version).toBe(2);
    view.fetch.mockImplementation(async () => Response.json(body("a", 9, "another")));
    await expect(fetchPageNavigationData(view.client, "project", "a")).rejects.toThrow("scope");
    view.fetch.mockImplementation(async () => Response.json({ error: "Forbidden" }, { status: 403 }));
    await expect(fetchPageNavigationData(view.client, "project", "a")).rejects.toMatchObject({ status: 403 });
  } finally { view.close(); }
});

it("excludes draft documents and serializes renewal while a foreground query holds transport", async () => {
  const view = setup(["a", "c", "e", "g"]); markDraftPage("g");
  try {
    let release!: () => void;
    const foreground = view.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise((resolve) => { release = () => resolve("done"); }) });
    await vi.advanceTimersByTimeAsync(12_000); expect(view.fetch).not.toHaveBeenCalled();
    let concurrent = 0, maximum = 0;
    view.fetch.mockImplementation(async (url) => {
      maximum = Math.max(maximum, ++concurrent);
      await Promise.resolve(); concurrent--;
      return Response.json(body(String(url).split("/").at(-1)!));
    });
    release(); await foreground; await vi.advanceTimersByTimeAsync(2000);
    expect(maximum).toBe(1);
    expect(view.fetch.mock.calls.every(([url]) => !String(url).endsWith("/g"))).toBe(true);
    expect(new Set(view.fetch.mock.calls.map(([url]) => String(url).split("/").at(-1))).size).toBeLessThanOrEqual(3);
  } finally { forgetDraftPage("g"); view.close(); }
});
