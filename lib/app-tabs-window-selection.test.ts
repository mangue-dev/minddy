// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "./app-tabs-context";
import { createHomeTab, type AppTab } from "./app-tabs";
import { appTabsStorageKey } from "./app-tabs-storage";
import { appTabsQueryKey } from "./use-app-tabs-query";
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
let holdSeals: boolean;
let sealReads: Array<{ signal: AbortSignal; selection: { id: string; href: string }; finish: () => void }>;
const firstId = "10000000-0000-0000-0000-000000000001";
const secondId = "10000000-0000-0000-0000-000000000002";
const rows = (owner = "owner"): AppTab[] => [createHomeTab(owner, firstId), { ...createHomeTab(owner, secondId, 1), href: "/all" }];
const snapshot = (owner: string) => ({ format: "minddy-local-v1", owner, expiresAt: Date.now() + 60_000, ciphertext: `sealed-${owner}` });
function Probe() {
  value = useOptionalAppTabs();
  return createElement("span", null, value?.activeId ?? "Pending");
}
async function render(restoring = false, strict = false) {
  const tree = createElement(QueryClientProvider, { client },
    createElement(IsRestoringProvider, { value: restoring },
      createElement(AppTabsProvider, { children: createElement(Probe) })));
  await act(() => root.render(strict ? createElement(StrictMode, null, tree) : tree));
}
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); }); };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = { id: "owner" };
  auth.sdkOwner = "owner";
  viewport.mobile = false;
  vi.clearAllMocks();
  invalidateLocalSnapshotWrites();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
  reads = []; opens = []; writes = []; seals = []; sealReads = []; holdSeals = false; value = null;
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
      if (holdSeals) return new Promise<Response>((resolve) => {
        const owner = auth.sdkOwner;
        const ordinal = sealReads.length;
        // Intentionally ignore abort at the transport layer. The real helper
        // must fence late ACKs without relying on a cooperative server.
        sealReads.push({ signal: init!.signal as AbortSignal, selection: body.value,
          finish: () => resolve(Response.json({ snapshot: { ...snapshot(owner), ciphertext: `sealed-selection-${ordinal}` } })) });
      });
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
  invalidateLocalSnapshotWrites();
  for (const pending of reads) pending.finish([]);
  for (const pending of opens) pending.finish(undefined);
  for (const pending of sealReads) pending.finish();
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mounted window-selection writer ownership", () => {
  async function initializeHeldWriter(strict = false) {
    holdSeals = true;
    await render(false, strict);
    const canonical = reads.findLast((read) => !read.signal.aborted);
    expect(canonical).toBeDefined();
    canonical!.finish(rows());
    await settle();
    await render(false, strict);
    await settle();
    expect(value?.activeId).toBe(firstId);
    expect(sealReads).toHaveLength(1);
    expect(sealReads[0].selection).toEqual({ id: firstId, href: "/home" });
    return value!.session;
  }

  it("keeps the same writer across Strict Mode replay and deduplicates repeated published selections", async () => {
    const session = await initializeHeldWriter(true);
    await act(async () => {
      session.remember(firstId, "/home");
      session.remember(firstId, "/home");
    });
    await render(false, true);
    expect(sealReads).toHaveLength(1);
    expect(sealReads[0].signal.aborted).toBe(false);
    sealReads[0].finish();
    await settle();
    await act(() => {
      session.remember(firstId, "/home");
      window.dispatchEvent(new Event("pagehide"));
    });
    await settle();
    expect(sealReads).toHaveLength(1);
    expect(JSON.parse(sessionStorage.getItem(appTabsStorageKey("owner"))!)).toMatchObject({
      owner: "owner", ciphertext: "sealed-selection-0",
    });
  });

  it("flushes the latest real activation on pagehide without waiting for an obsolete selection ACK", async () => {
    const session = await initializeHeldWriter();
    await act(() => session.activate(secondId));
    await settle();
    expect(value?.activeId).toBe(secondId);
    expect(sealReads).toHaveLength(1);
    const hide = vi.spyOn(session, "onPageHide");
    await act(() => window.dispatchEvent(new Event("pagehide")));
    await settle();
    expect(hide).toHaveBeenCalledOnce();
    expect(sealReads).toHaveLength(2);
    expect(sealReads[0].signal.aborted).toBe(true);
    expect(sealReads[1].selection).toEqual({ id: secondId, href: "/all" });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    await settle();
    expect(hide).toHaveBeenCalledTimes(2);
    expect(sealReads).toHaveLength(2);
    sealReads[1].finish();
    await settle();
    sealReads[0].finish();
    await settle();
    expect(JSON.parse(sessionStorage.getItem(appTabsStorageKey("owner"))!)).toMatchObject({
      owner: "owner", ciphertext: "sealed-selection-1",
    });
    expect(writes).toEqual([]);
    visibility.mockRestore();
    hide.mockRestore();
  });

  it.each(["mobile", "replacement account"])("disposes the actual writer on %s retirement and ignores its late ACK", async (retirement) => {
    const session = await initializeHeldWriter();
    await act(() => session.activate(secondId));
    const dispose = vi.spyOn(session, "dispose");
    if (retirement === "mobile") viewport.mobile = true;
    else {
      auth.user = { id: "replacement" };
      auth.sdkOwner = "replacement";
      invalidateLocalSnapshotWrites();
    }
    await render(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sealReads[0].signal.aborted).toBe(true);
    sealReads[0].finish();
    await settle();
    expect(sessionStorage.getItem(appTabsStorageKey("owner"))).toBeNull();
    await act(() => {
      session.remember(firstId, "/home");
      window.dispatchEvent(new Event("pagehide"));
    });
    await settle();
    expect(sealReads).toHaveLength(1);
    expect(sessionStorage.getItem(appTabsStorageKey("owner"))).toBeNull();
    expect(writes).toEqual([]);
  });

  it("retires the old same-account session when its QueryClient is replaced", async () => {
    const session = await initializeHeldWriter();
    const previousClient = client;
    const dispose = vi.spyOn(session, "dispose");
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(appTabsQueryKey("owner"), rows());
    await render(false);
    await settle();
    expect(value?.session).not.toBe(session);
    expect(dispose).toHaveBeenCalledOnce();
    expect(sealReads).toHaveLength(2);
    expect(sealReads[0].signal.aborted).toBe(true);
    expect(sealReads[1].signal.aborted).toBe(false);
    sealReads[0].finish();
    await settle();
    expect(sessionStorage.getItem(appTabsStorageKey("owner"))).toBeNull();
    sealReads[1].finish();
    await settle();
    expect(JSON.parse(sessionStorage.getItem(appTabsStorageKey("owner"))!)).toMatchObject({
      owner: "owner", ciphertext: "sealed-selection-1",
    });
    previousClient.clear();
  });
});
