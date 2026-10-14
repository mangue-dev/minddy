// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "./app-tabs-context";
import { createHomeTab, type AppTab } from "./app-tabs";
import { appTabsQueryKey, appTabsQueryOptions } from "./use-app-tabs-query";
import { appTabsStorageKey } from "./app-tabs-storage";
import { invalidateLocalSnapshotWrites } from "./local-snapshots";

const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, sdkOwner: "owner" }));
const viewport = vi.hoisted(() => ({ mobile: false as boolean | undefined }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const visit = vi.hoisted(() => vi.fn());
vi.mock("./auth-context", () => ({ useAuth: () => auth }));
vi.mock("./use-mobile-layout", () => ({ useMobileLayout: () => viewport.mobile }));
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: auth.sdkOwner } } }, error: null }),
} }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));
vi.mock("./use-pr-background", () => ({ PrBackgroundSync: () => null }));
vi.mock("./pr-tab-preparation", () => ({ createPrTabPreparation: () => ({ visit, dispose: vi.fn() }) }));
vi.mock("./prefetch-tab-destination", () => ({
  prefetchAppTabDestination: vi.fn(), isPreparedAppTabDestination: () => false,
}));

interface PendingRead {
  signal: AbortSignal;
  finish: (value: unknown, status?: number) => void;
}
interface PendingOpen {
  owner: string;
  finish: (value: unknown, status?: number) => void;
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let value: ReturnType<typeof useOptionalAppTabs>;
let reads: PendingRead[];
let opens: PendingOpen[];
let writes: string[];
let seals: unknown[];
let stopObservers: Array<() => void>;
const firstId = "10000000-0000-0000-0000-000000000001";
const secondId = "10000000-0000-0000-0000-000000000002";
const rows = (owner = "owner"): AppTab[] => [createHomeTab(owner, firstId), { ...createHomeTab(owner, secondId, 1), href: "/all" }];
const snapshot = (owner: string) => ({ format: "minddy-local-v1", owner, expiresAt: Date.now() + 60_000, ciphertext: `sealed-${owner}` });
function Probe() {
  value = useOptionalAppTabs();
  return createElement("span", null, value?.activeId ?? "Pending");
}
async function render(restoring = true, strict = false) {
  const tree = createElement(QueryClientProvider, { client },
    createElement(IsRestoringProvider, { value: restoring },
      createElement(AppTabsProvider, { children: createElement(Probe) })));
  await act(() => root.render(strict ? createElement(StrictMode, null, tree) : tree));
}
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };
const remember = (owner = "owner") => sessionStorage.setItem(appTabsStorageKey(owner), JSON.stringify(snapshot(owner)));
function expectWaiting() {
  expect(value?.activeId).toBeNull();
  expect(writes).toEqual([]);
  expect(seals).toEqual([]);
  expect(router.push).not.toHaveBeenCalled();
  expect(visit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = { id: "owner" };
  auth.sdkOwner = "owner";
  viewport.mobile = false;
  vi.clearAllMocks();
  invalidateLocalSnapshotWrites();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
  reads = []; opens = []; writes = []; seals = []; stopObservers = []; value = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/me/app-tabs" && !init?.method) return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      reads.push({ signal, finish: (body, status = 200) => resolve(Response.json(body, { status })) });
    });
    if (url === "/api/me/local-snapshots") {
      const body = JSON.parse(String(init?.body));
      if (body.operation === "open") return new Promise<Response>((resolve) => {
        opens.push({ owner: body.snapshot.owner, finish: (opened, status = 200) => resolve(Response.json({ value: opened }, { status })) });
      });
      seals.push(body.value);
      return Promise.resolve(Response.json({ snapshot: snapshot(auth.sdkOwner) }));
    }
    writes.push(`${init?.method ?? "GET"} ${url}`);
    return Promise.resolve(Response.json({ code: "unexpected_write" }, { status: 500 }));
  }));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  for (const stop of stopObservers) stop();
  invalidateLocalSnapshotWrites();
  for (const pending of reads) pending.finish([]);
  for (const pending of opens) pending.finish(undefined);
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

describe("canonical desktop tab startup admission", () => {
  it.each(["canonical", "window"])("starts both reads during query restoration and awaits the slower %s gate", async (last) => {
    remember();
    await render();
    expect(reads).toHaveLength(1);
    expect(opens).toHaveLength(1);
    expectWaiting();
    if (last === "canonical") opens[0].finish({ id: secondId, href: "/all" });
    else reads[0].finish(rows());
    await settle();
    await render(false);
    expectWaiting();
    if (last === "canonical") reads[0].finish(rows());
    else opens[0].finish({ id: secondId, href: "/all" });
    await settle();
    expect(value?.activeId).toBe(secondId);
    expect(value?.tabs).toHaveLength(2);
    expect(router.push).toHaveBeenCalledWith("/all", { scroll: false });
    expect(reads).toHaveLength(1);
    expect(opens).toHaveLength(1);
    expect(writes).toEqual([]);
    expect(visit).toHaveBeenCalledWith("/all", ["/home", "/all"]);
    // Later canonical reconciliation must not reopen the startup snapshot.
    await act(() => client.setQueryData(appTabsQueryKey("owner"), rows().map((tab) => ({ ...tab, revision: 2 }))));
    await settle();
    expect(opens).toHaveLength(1);
    expect(value?.activeId).toBe(secondId);
  });

  it("coalesces held-restoration Strict Mode replay without an early mutation or initialization", async () => {
    remember();
    await render(true, true);
    expect(reads).toHaveLength(1);
    expect(opens).toHaveLength(1);
    expect(reads[0].signal.aborted).toBe(false);
    expectWaiting();
    reads[0].finish(rows());
    opens[0].finish({ id: firstId, href: "/home" });
    await settle();
    expectWaiting();
    await render(false, true);
    await settle();
    expect(value?.activeId).toBe(firstId);
    expect(reads).toHaveLength(1);
    expect(opens).toHaveLength(1);
    expect(seals).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it("keeps a canonical failure uninitialized even when optional restoration succeeds", async () => {
    remember();
    await render();
    reads[0].finish({ code: "forbidden" }, 403);
    opens[0].finish({ id: firstId, href: "/home" });
    await settle();
    expect(client.getQueryState(appTabsQueryKey("owner"))?.status).toBe("error");
    await render(false);
    // The ordinary observer may retry a failed early read when restoration
    // ends. Neither attempt is allowed to initialize from the window alone.
    expect(reads).toHaveLength(2);
    expectWaiting();
    reads[1].finish({ code: "forbidden" }, 403);
    await settle();
    expect(value?.loadError).toBe(true);
    expectWaiting();
  });

  it("falls back to the existing URL when the optional encrypted selection cannot open", async () => {
    remember();
    window.history.replaceState(null, "", "/all");
    await render();
    reads[0].finish(rows());
    opens[0].finish(undefined, 403);
    await settle();
    await render(false);
    await settle();
    expect(value?.activeId).toBe(secondId);
    expect(value?.session.getActiveHref()).toBe("/all");
    expect(writes).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("uses the freshest explicit URL after the two independent reads settle", async () => {
    remember();
    await render();
    reads[0].finish(rows());
    window.history.replaceState(null, "", "/all");
    opens[0].finish({ id: firstId, href: "/home" });
    await settle();
    await render(false);
    await settle();
    expect(value?.activeId).toBe(secondId);
    expect(value?.session.getActiveHref()).toBe("/all");
    expect(writes).toEqual([]);
  });

  it.each([undefined, true])("does not read canonical or sealed tabs for mobile layout %s", async (mobile) => {
    viewport.mobile = mobile;
    remember();
    await render();
    expect(reads).toHaveLength(0);
    expect(opens).toHaveLength(0);
    expect(value).toBeNull();
  });

  it("retires an unfinished desktop owner on mobile and keeps the route on rotation back", async () => {
    remember();
    await render();
    const previous = value!.session;
    const disposed = vi.spyOn(previous, "dispose");
    viewport.mobile = true;
    await render();
    expect(disposed).toHaveBeenCalledOnce();
    expect(reads[0].signal.aborted).toBe(true);
    opens[0].finish({ id: secondId, href: "/all" });
    reads[0].finish(rows());
    await settle();
    expect(previous.getSnapshot().activeId).toBeNull();
    window.history.replaceState(null, "", "/all");
    viewport.mobile = false;
    await render();
    expect(reads).toHaveLength(2);
    expect(opens).toHaveLength(1);
    reads[1].finish(rows());
    await settle();
    await render(false);
    await settle();
    expect(value?.activeId).toBe(secondId);
    expect(value?.session).not.toBe(previous);
    expect(router.push).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("fences retired account reads and late window results from the replacement session", async () => {
    remember(); remember("replacement");
    await render();
    const previous = value!.session;
    auth.user = { id: "replacement" }; auth.sdkOwner = "replacement";
    invalidateLocalSnapshotWrites();
    await render();
    expect(reads).toHaveLength(2);
    expect(reads[0].signal.aborted).toBe(true);
    expect(opens.map((open) => open.owner)).toEqual(["owner", "replacement"]);
    reads[0].finish(rows());
    opens[0].finish({ id: secondId, href: "/all" });
    reads[1].finish(rows("replacement"));
    opens[1].finish({ id: firstId, href: "/home" });
    await settle();
    await render(false);
    await settle();
    expect(previous.getSnapshot().activeId).toBeNull();
    expect(value?.activeId).toBe(firstId);
    expect(value?.tabs.every((tab) => tab.user_id === "replacement")).toBe(true);
    expect(client.getQueryData(appTabsQueryKey("owner"))).toBeUndefined();
    expect(writes).toEqual([]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("preserves the same read when a real enabled foreground observer joins before retirement", async () => {
    await render();
    expect(reads).toHaveLength(1);
    const observer = new QueryObserver(client, appTabsQueryOptions("owner"));
    stopObservers.push(observer.subscribe(() => {}));
    expect(reads).toHaveLength(1);
    viewport.mobile = true;
    await render();
    expect(value).toBeNull();
    expect(reads[0].signal.aborted).toBe(false);
    const accepted = rows();
    reads[0].finish(accepted);
    await settle();
    expect(observer.getCurrentResult().isSuccess).toBe(true);
    expect(client.getQueryData(appTabsQueryKey("owner"))).toEqual(accepted);
    expect(writes).toEqual([]);
  });

  it("does not cancel a replacement operation under the same key when the captured read already retired", async () => {
    await render();
    await act(() => client.cancelQueries({ queryKey: appTabsQueryKey("owner"), exact: true }));
    expect(reads[0].signal.aborted).toBe(true);
    const replacement = client.fetchQuery(appTabsQueryOptions("owner"));
    void replacement.catch(() => {});
    await settle();
    expect(reads).toHaveLength(2);
    viewport.mobile = true;
    await render();
    expect(reads[1].signal.aborted).toBe(false);
    const accepted = rows();
    reads[1].finish(accepted);
    await replacement;
    expect(client.getQueryData(appTabsQueryKey("owner"))).toEqual(accepted);
    expect(writes).toEqual([]);
  });
});

describe("canonical tab query account binding", () => {
  it("rejects a changed SDK owner before issuing even an empty canonical GET", async () => {
    auth.sdkOwner = "replacement";
    await expect(client.fetchQuery(appTabsQueryOptions("owner"))).rejects.toThrow("account_changed");
    expect(reads).toHaveLength(0);
    expect(client.getQueryData(appTabsQueryKey("owner"))).toBeUndefined();
  });

  it.each(["foreign rows", "changed owner with empty rows"])("rejects %s before assigning the response to the requested key", async (mode) => {
    const result = client.fetchQuery(appTabsQueryOptions("owner"));
    const rejected = expect(result).rejects.toThrow(mode === "foreign rows" ? "account_changed" : "Local account changed");
    await settle();
    if (mode !== "foreign rows") auth.sdkOwner = "replacement";
    reads[0].finish(mode === "foreign rows" ? rows("replacement") : []);
    await rejected;
    expect(client.getQueryData(appTabsQueryKey("owner"))).toBeUndefined();
  });
});
