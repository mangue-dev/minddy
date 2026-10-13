// @vitest-environment jsdom

import { onlineManager, QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPageNavigationPreparation } from "./page-navigation-preparation";
import { fetchPageNavigationData, isPreparedPageData, pageKey, pagesKey } from "./use-pages-query";
import { forgetDraftPage, markDraftPage } from "./pages-draft";
import type { Page } from "./pages";
import { navigationPreparationPriority } from "./navigation-preparation-priority";
import { forgetLastPage, rememberLastPage } from "./pages-last-open";

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

function prepareNeighbor(view: ReturnType<typeof setup>, entries = [body("n", 1, "next"), body("o", 1, "next")]) {
  view.client.setQueryData(["projects"], [{ id: "project" }, { id: "next" }]);
  view.client.setQueryData(pagesKey("next"), entries);
  view.fetch.mockImplementation(async (url) => {
    const parts = String(url).split("/");
    return Response.json(body(parts.at(-1)!, 1, parts[3]));
  });
  view.preparation.visit("/projects/project", ["/projects/project", href("a"), href("c"), href("e")]);
  view.preparation.prioritize(href("a"));
}

it("prepares an authorized neighboring entry instead of an unrelated third document with bounded sequential reads", async () => {
  const view = setup(["a", "c", "e"]); let concurrent = 0, maximum = 0;
  try {
    prepareNeighbor(view);
    view.fetch.mockImplementation((url) => new Promise((resolve) => {
      maximum = Math.max(maximum, ++concurrent);
      setTimeout(() => {
        concurrent--;
        const parts = String(url).split("/");
        resolve(Response.json(body(parts.at(-1)!, 1, parts[3])));
      }, 25);
    }));
    await vi.advanceTimersByTimeAsync(17_000);
    expect(new Set(view.fetch.mock.calls.map(([url]) => String(url).split("/").at(-1)))).toEqual(new Set(["a", "b", "n"]));
    expect(maximum).toBe(1);
    expect(isPreparedPageData("n", view.client.getQueryState(pageKey("n"))!.dataUpdatedAt)).toBe(true);
    view.client.invalidateQueries({ queryKey: ["projects"], refetchType: "none" });
    const reads = view.fetch.mock.calls.filter(([url]) => String(url).includes("/next/")).length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(view.fetch.mock.calls.filter(([url]) => String(url).includes("/next/")).length).toBe(reads);
  } finally { view.close(); }
});

it.each(["o", "foreign"])("validates remembered neighboring document %s against the authorized tree", async (remembered) => {
  const view = setup();
  try {
    rememberLastPage("next", remembered); prepareNeighbor(view);
    await vi.advanceTimersByTimeAsync(500);
    const expected = remembered === "o" ? "o" : "n";
    expect(view.fetch.mock.calls.filter(([url]) => String(url).includes("/next/")).map(([url]) => url)).toEqual([`/api/projects/next/pages/${expected}`]);
  } finally { forgetLastPage("next"); view.close(); }
});

it.each(["project-invalidated", "tree-invalidated", "foreign-row", "draft", "database"])("excludes neighboring entry with %s", async (reason) => {
  const view = setup();
  try {
    prepareNeighbor(view, [body("n", 1, reason === "foreign-row" ? "foreign" : "next")]);
    if (reason === "project-invalidated") view.client.invalidateQueries({ queryKey: ["projects"], refetchType: "none" });
    if (reason === "tree-invalidated") view.client.invalidateQueries({ queryKey: pagesKey("next"), refetchType: "none" });
    if (reason === "draft") markDraftPage("n");
    if (reason === "database") view.client.setQueryData(pagesKey("next"), [{ ...body("n", 1, "next"), database_schema: {} }]);
    await vi.advanceTimersByTimeAsync(17_000);
    expect(view.fetch.mock.calls.some(([url]) => String(url).includes("/next/"))).toBe(false);
  } finally { forgetDraftPage("n"); view.close(); }
});

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

it("keeps the ranked prepared destination ready despite older open Page tabs", async () => {
  const view = setup(["a", "c"]);
  try {
    view.preparation.visit("/home", ["/home", href("c"), href("a"), href("unknown-old-tab")]);
    view.preparation.prioritize(href("c"));
    await vi.advanceTimersByTimeAsync(25_000);
    const reads = view.fetch.mock.calls.map(([url]) => String(url).split("/").at(-1));
    expect(reads).toContain("c");
    expect(reads).toContain("d");
    expect(reads).not.toContain("b");
    expect(reads).not.toContain("unknown-old-tab");
    expect(isPreparedPageData("c", view.client.getQueryState(pageKey("c"))!.dataUpdatedAt)).toBe(true);
    expect(new Set(reads).size).toBeLessThanOrEqual(3);
  } finally { view.close(); }
});

it("does not postpone a due renewal after unrelated cache notifications", async () => {
  const view = setup();
  try {
    document.body.innerHTML = '<div data-page-surface-id="b"></div>';
    for (let index = 0; index < 100; index++) {
      view.client.setQueryData(["unrelated", "local-state"], index);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(view.fetch.mock.calls.some(([url]) => String(url).endsWith("/a"))).toBe(true);
    expect(isPreparedPageData("a", view.client.getQueryState(pageKey("a"))!.dataUpdatedAt)).toBe(true);
  } finally { view.close(); }
});

it("prepares one unknown neighbor behind an empty reservation only after the actual navigation read finishes", async () => {
  const view = setup(); const navigation = navigationPreparationPriority(view.client); const key = ["foreground"];
  let finish!: () => void;
  const read = view.client.fetchQuery({ queryKey: key, queryFn: () => new Promise((resolve) => { finish = () => resolve("ready"); }) });
  navigation.acquire(); navigation.startRead(key);
  try {
    await vi.advanceTimersByTimeAsync(7000); expect(view.fetch).not.toHaveBeenCalled();
    finish(); await read; navigation.finishRead(key);
    await vi.advanceTimersByTimeAsync(100);
    expect(view.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/projects/project/pages/b"]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(view.fetch.mock.calls.map(([url]) => url)).toEqual(["/api/projects/project/pages/b", "/api/projects/project/pages/a"]);
    expect(isPreparedPageData("a", view.client.getQueryState(pageKey("a"))!.dataUpdatedAt)).toBe(true);
    expect(isPreparedPageData("b", view.client.getQueryState(pageKey("b"))!.dataUpdatedAt)).toBe(true);
  } finally { navigation.release(); view.close(); }
});

it("does not scan document DOM for unrelated observer and local cache notifications", async () => {
  const view = setup();
  const scans = vi.spyOn(document, "querySelectorAll");
  try {
    scans.mockClear();
    for (let index = 0; index < 100; index++) {
      view.client.setQueryData(["unrelated", index], index);
      const observer = new QueryObserver(view.client, { queryKey: ["unrelated", index], enabled: false });
      const stop = observer.subscribe(() => {}); stop();
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(scans.mock.calls.filter(([selector]) => selector === "[data-page-surface-id]").length).toBeLessThan(20);
  } finally { scans.mockRestore(); view.close(); }
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

it("yields an unknown read to foreground work and resumes without granting a canceled lease", async () => {
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
    document.body.innerHTML = '<div data-page-surface-id="a"></div>';
    view.fetch.mockImplementation(async () => Response.json({ ...body("b"), content: { type: "doc", content: [{ type: "image" }] } }));
    release(); await pending;
    await vi.advanceTimersByTimeAsync(100);
    expect(view.fetch).toHaveBeenCalledTimes(2);
    expect(view.client.getQueryData<Page>(pageKey("b"))?.id).toBe("b");
    expect(isPreparedPageData("b", view.client.getQueryState(pageKey("b"))!.dataUpdatedAt)).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000); expect(view.fetch).toHaveBeenCalledTimes(2);
  } finally { view.close(); }
});

it("keeps a Page read through cached tab reconciliation but blocks on an initial tab list", async () => {
  const view = setup(); let signal!: AbortSignal, completePage!: () => void;
  view.fetch.mockImplementation((_url, init) => new Promise((resolve) => {
    signal = init!.signal!; completePage = () => resolve(Response.json(body("b")));
  }));
  let completeTabs!: () => void;
  try {
    view.client.setQueryData(["app-tabs", "owner"], []);
    await vi.advanceTimersByTimeAsync(500); expect(signal.aborted).toBe(false);
    const tabs = view.client.fetchQuery({ queryKey: ["app-tabs", "owner"], queryFn: () => new Promise((resolve) => { completeTabs = () => resolve([]); }), staleTime: 0 });
    expect(signal.aborted).toBe(false);
    completePage(); await vi.advanceTimersByTimeAsync(1);
    expect(view.client.getQueryState(pageKey("b"))?.status).toBe("success");
    completeTabs(); await tabs;
    view.preparation.dispose();
    const next = createPageNavigationPreparation(view.client);
    const initial = view.client.fetchQuery({ queryKey: ["app-tabs", "new-window"], queryFn: () => new Promise((resolve) => { completeTabs = () => resolve([]); }) });
    next.visit("/home", ["/home", href("a")]);
    await vi.advanceTimersByTimeAsync(20_000); expect(view.fetch).toHaveBeenCalledOnce();
    next.dispose(); completeTabs(); await initial;
  } finally { completePage?.(); completeTabs?.(); view.close(); }
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
