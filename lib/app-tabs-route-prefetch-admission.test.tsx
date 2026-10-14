// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "./app-tabs-context";
import { createHomeTab } from "./app-tabs";
import { invalidateLocalSnapshotWrites } from "./local-snapshots";
import { navigationPreparationPending, navigationPreparationPriority } from "./navigation-preparation-priority";
import { useDeferredRoutePrefetch } from "./use-route-prefetch-admission";

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
vi.mock("./prefetch-tab-destination", () => ({ prefetchAppTabDestination: vi.fn(), isPreparedAppTabDestination: () => false }));

let root: Root, container: HTMLDivElement, client: QueryClient;
let reads: Array<{ finish: (body: unknown, status?: number) => void }>;
let writes: string[], snapshots: boolean[];
let tabs: ReturnType<typeof useOptionalAppTabs>;
const clients: QueryClient[] = [];
const makeClient = () => {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(value); return value;
};
function Probe() {
  const deferred = useDeferredRoutePrefetch(true, "/all", undefined);
  tabs = useOptionalAppTabs(); snapshots.push(deferred);
  return createElement("span", { "data-deferred": String(deferred) });
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
  vi.clearAllMocks(); visit.mockReset(); auth.user = { id: "owner" }; auth.sdkOwner = "owner"; viewport.mobile = false;
  invalidateLocalSnapshotWrites(); sessionStorage.clear(); window.history.replaceState(null, "", "/home");
  reads = []; writes = []; snapshots = []; tabs = null; client = makeClient();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/me/app-tabs" && !init?.method) return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      reads.push({ finish: (body, status = 200) => resolve(Response.json(body, { status })) });
    });
    if (url === "/api/me/local-snapshots") return Promise.resolve(Response.json({ snapshot: {
      format: "minddy-local-v1", owner: auth.sdkOwner, expiresAt: Date.now() + 60_000, ciphertext: "sealed",
    } }));
    writes.push(`${init?.method ?? "GET"} ${url}`);
    return Promise.resolve(Response.json({ code: "unexpected_write" }, { status: 500 }));
  }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount()); invalidateLocalSnapshotWrites();
  for (const read of reads) read.finish([]);
  for (const value of clients.splice(0)) value.clear();
  container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("app-scoped route prefetch lifecycle", () => {
  it("closes the first render before the existing startup reservation mounts", async () => {
    await render(true);
    expect(snapshots).not.toContain(false); expect(reads).toHaveLength(0);
    expect(navigationPreparationPending(client)).toBe(true);
    await render(false); expect(reads).toHaveLength(1);
    expect(snapshots).not.toContain(false);
    reads[0].finish([createHomeTab("owner", "10000000-0000-0000-0000-000000000001")]); await settle();
    expect(visit).toHaveBeenCalledOnce(); expect(snapshots.at(-1)).toBe(false); expect(writes).toEqual([]);
    expect(router.prefetch).not.toHaveBeenCalled();
  });

  it("keeps the gate closed across the existing startup-to-worker handoff", async () => {
    const worker = navigationPreparationPriority(client); visit.mockImplementation(() => worker.acquire());
    await render(false);
    reads[0].finish([createHomeTab("owner", "10000000-0000-0000-0000-000000000001")]); await settle();
    expect(visit).toHaveBeenCalledOnce(); expect(snapshots).not.toContain(false);
    await act(async () => worker.release()); expect(snapshots.at(-1)).toBe(false);
  });

  it.each(["read failure", "empty initial creation failure"])("reopens after the existing %s release", async (failure) => {
    await render(false); expect(snapshots).not.toContain(false);
    reads[0].finish(failure === "read failure" ? { code: "database" } : [], failure === "read failure" ? 500 : 200);
    await settle(); expect(snapshots.at(-1)).toBe(false); expect(navigationPreparationPending(client)).toBe(false);
    expect(visit).not.toHaveBeenCalled();
    if (failure === "read failure") expect(tabs?.loadError).toBe(true);
    else expect(writes).toEqual(["POST /api/me/app-tabs"]);
  });

  it("starts each replacement account/client closed and ignores the retired lifetime", async () => {
    await render(false); const oldClient = client;
    reads[0].finish([createHomeTab("owner", "10000000-0000-0000-0000-000000000001")]); await settle();
    expect(snapshots.at(-1)).toBe(false);
    auth.user = { id: "replacement" }; auth.sdkOwner = "replacement"; client = makeClient(); snapshots = [];
    await render(true); await settle(); expect(snapshots).not.toContain(false);
    expect(navigationPreparationPending(oldClient)).toBe(false); expect(navigationPreparationPending(client)).toBe(true);
    const previous = navigationPreparationPriority(oldClient);
    await act(async () => { previous.acquire(); previous.release(); }); expect(snapshots).not.toContain(false);
    await render(false); reads[1].finish({ code: "database" }, 500); await settle();
    expect(snapshots.at(-1)).toBe(false);
  });

  it("holds unresolved layout closed, leaves known mobile ungated and closes desktop entry", async () => {
    viewport.mobile = undefined; await render(true); expect(snapshots).not.toContain(false);
    expect(reads).toHaveLength(0); expect(navigationPreparationPending(client)).toBe(false);
    viewport.mobile = true; await render(true); expect(snapshots.at(-1)).toBe(false);
    viewport.mobile = false; snapshots = []; await render(true); expect(snapshots).not.toContain(false);
    expect(navigationPreparationPending(client)).toBe(true);
  });

  it("survives Strict Mode replay without opening before initialization", async () => {
    await render(true, true); await settle(); expect(snapshots).not.toContain(false);
    expect(navigationPreparationPending(client)).toBe(true); expect(reads).toHaveLength(0);
    viewport.mobile = true; await render(true, true); await settle();
    expect(snapshots.at(-1)).toBe(false); expect(navigationPreparationPending(client)).toBe(false);
  });
});
