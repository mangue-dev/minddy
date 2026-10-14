// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "@/lib/app-tabs-context";
import { createHomeTab, type AppTab } from "@/lib/app-tabs";
import { appTabsStorageKey } from "@/lib/app-tabs-storage";
import { invalidateLocalSnapshotWrites } from "@/lib/local-snapshots";
import { navigationPreparationPending, navigationPreparationPriority, subscribeNavigationPreparation } from "@/lib/navigation-preparation-priority";
import { scheduleSearchIndexArm } from "@/lib/use-search-index";

const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, sdkOwner: "owner" }));
const viewport = vi.hoisted(() => ({ mobile: false as boolean | undefined }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
const visit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => viewport.mobile }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: auth.sdkOwner } } }, error: null }),
} }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));
vi.mock("@/lib/use-pr-background", () => ({ PrBackgroundSync: () => null }));
vi.mock("@/lib/pr-tab-preparation", () => ({ createPrTabPreparation: () => ({ visit, dispose: vi.fn() }) }));
vi.mock("@/lib/prefetch-tab-destination", () => ({
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
  visit.mockReset();
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

describe("mounted restored-tab startup admission", () => {
  it("reserves optional admission while the ordinary canonical query is restoring", async () => {
    await render(true);
    expect(reads).toHaveLength(0);
    expect(navigationPreparationPending(client)).toBe(true);
    let runQuietPeriod: (() => void) | undefined;
    const arm = vi.fn();
    const stop = scheduleSearchIndexArm({
      setTimeout(callback) { runQuietPeriod = callback; return 1; }, clearTimeout() {},
    }, arm, { pending: () => navigationPreparationPending(client),
      subscribe: (changed) => subscribeNavigationPreparation(client, changed) });
    runQuietPeriod!();
    expect(arm).not.toHaveBeenCalled();
    await render(false);
    expect(reads).toHaveLength(1);
    expect(navigationPreparationPending(client)).toBe(true);
    reads[0].finish(rows()); await settle();
    expect(value?.activeId).toBe(firstId);
    expect(visit).toHaveBeenCalledOnce();
    expect(navigationPreparationPending(client)).toBe(false);
    expect(arm).toHaveBeenCalledOnce();
    expect(writes).toEqual([]);
    stop();
  });

  it("holds the canonical list until the existing sealed window selection resolves", async () => {
    sessionStorage.setItem(appTabsStorageKey("owner"), JSON.stringify(snapshot("owner")));
    await render(false);
    reads[0].finish(rows()); await settle();
    expect(opens).toHaveLength(1);
    expect(value?.activeId).toBeNull();
    expect(navigationPreparationPending(client)).toBe(true);
    expect(visit).not.toHaveBeenCalled();
    opens[0].finish({ id: firstId, href: "/home" }); await settle();
    expect(value?.activeId).toBe(firstId);
    expect(visit).toHaveBeenCalledOnce();
    expect(navigationPreparationPending(client)).toBe(false);
    expect(writes).toEqual([]);
  });

  it("hands off to the finite worker without admitting optional work between owners", async () => {
    const worker = navigationPreparationPriority(client), transitions: boolean[] = [];
    visit.mockImplementation(() => worker.acquire());
    await render(false);
    const stop = subscribeNavigationPreparation(client, () => transitions.push(navigationPreparationPending(client)));
    reads[0].finish(rows()); await settle();
    expect(value?.activeId).toBe(firstId);
    expect(navigationPreparationPending(client)).toBe(true);
    expect(transitions).not.toContain(false);
    worker.release();
    expect(navigationPreparationPending(client)).toBe(false);
    stop();
  });

  it("releases optional admission after the ordinary canonical query exhausts its retries", async () => {
    await render(false);
    expect(navigationPreparationPending(client)).toBe(true);
    reads[0].finish({ code: "database" }, 500); await settle();
    expect(value?.loadError).toBe(true);
    expect(navigationPreparationPending(client)).toBe(false);
    expect(visit).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("releases admission when initial creation fails instead of remaining pending forever", async () => {
    await render(false); reads[0].finish([]); await settle();
    expect(value?.activeId).toBeNull();
    expect(writes).toEqual(["POST /api/me/app-tabs"]);
    expect(navigationPreparationPending(client)).toBe(false);
    expect(value?.error).toBe("unexpected_write");
  });

  it("keeps the startup reservation through Strict Mode replay and releases on mobile retirement", async () => {
    const transitions: boolean[] = [];
    const stop = subscribeNavigationPreparation(client, () => transitions.push(navigationPreparationPending(client)));
    await render(true, true); await settle();
    expect(navigationPreparationPending(client)).toBe(true);
    expect(transitions).toEqual([true]);
    viewport.mobile = true; await render(true, true); await settle();
    expect(navigationPreparationPending(client)).toBe(false);
    expect(reads).toHaveLength(0);
    stop();
  });

  it("releases the exact old account/client while a replacement still resolves", async () => {
    await render(false); const oldClient = client;
    expect(navigationPreparationPending(oldClient)).toBe(true);
    auth.user = { id: "replacement" }; auth.sdkOwner = "replacement";
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    await render(true); await settle();
    expect(navigationPreparationPending(oldClient)).toBe(false);
    expect(navigationPreparationPending(client)).toBe(true);
    reads[0].finish(rows("owner")); await settle();
    expect(navigationPreparationPending(client)).toBe(true);
    expect(visit).not.toHaveBeenCalled();
    oldClient.clear();
  });
});
