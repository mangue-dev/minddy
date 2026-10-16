// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "@/lib/app-tabs-context";
import { createHomeTab, type AppTab } from "@/lib/app-tabs";
import { useAppTabsQuery } from "@/lib/use-app-tabs-query";
import { invalidateLocalSnapshotWrites } from "@/lib/local-snapshots";

const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => false }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));
vi.mock("@/lib/use-pr-background", () => ({ PrBackgroundSync: () => null }));
vi.mock("@/lib/app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(), isAppTabSurfaceReady: () => true }));

interface Pending<T> { signal: AbortSignal; finish: (body: T) => void }
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let value: ReturnType<typeof useOptionalAppTabs>;
let reads: Pending<AppTab[]>[];
let writes: Pending<{ tab: AppTab }>[];
const firstId = "10000000-0000-0000-0000-000000000001";
const secondId = "10000000-0000-0000-0000-000000000002";
const rows = (): AppTab[] => [createHomeTab("owner", firstId), createHomeTab("owner", secondId, 1)];
const pinned = (): AppTab => ({ ...rows()[0], pinned: true, revision: 2 });

function Probe() {
  value = useOptionalAppTabs();
  return null;
}
/** Another observer of the account's list that outlives the tab session. */
function ListObserver() {
  useAppTabsQuery("owner");
  return null;
}
function render(observeAfterDisposal = false) {
  return act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(IsRestoringProvider, { value: false },
      observeAfterDisposal ? createElement(ListObserver) : null,
      createElement(AppTabsProvider, { children: createElement(Probe) })))));
}
const advance = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
/** Mounts the account with its first list read answered, then fakes time. */
async function mount(observeAfterDisposal = false) {
  await render(observeAfterDisposal);
  await vi.waitFor(() => expect(reads).toHaveLength(1));
  await act(async () => { reads[0].finish(rows()); });
  await vi.waitFor(() => expect(value?.activeId).toBe(firstId));
  vi.useFakeTimers();
}
/** Pins the first tab and returns once its PATCH is on the wire. */
async function startWrite() {
  let update!: Promise<void>;
  await act(async () => { update = value!.session.update(firstId, { pinned: true }); });
  await advance();
  expect(writes).toHaveLength(1);
  return async () => {
    await act(async () => { writes[0].finish({ tab: pinned() }); await update; });
    await advance();
  };
}
/** What the realtime provider does when the write's broadcast arrives. */
const echo = () => act(async () => { void client.invalidateQueries({ queryKey: ["app-tabs"] }); });

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  auth.user = { id: "owner" };
  vi.clearAllMocks();
  invalidateLocalSnapshotWrites();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/home");
  reads = []; writes = []; value = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 300_000 } } });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    const signal = init!.signal as AbortSignal;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    const finish = (body: unknown) => resolve(Response.json(body));
    if (url === "/api/me/app-tabs" && !init?.method) reads.push({ signal, finish });
    else if (url === `/api/me/app-tabs/${firstId}` && init?.method === "PATCH") writes.push({ signal, finish });
    else reject(new Error(`Unexpected request ${init?.method ?? "GET"} ${url}`));
  })));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  vi.useRealTimers();
  await act(() => root.unmount());
  for (const pending of reads) pending.finish([]);
  invalidateLocalSnapshotWrites();
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("app tab write reconciliation", () => {
  it("lets the write's realtime echo perform the only list read", async () => {
    await mount();
    const acknowledge = await startWrite();
    await acknowledge();
    expect(value?.tabs.find((tab) => tab.id === firstId)).toMatchObject({ pinned: true, revision: 2 });
    expect(reads).toHaveLength(1);
    await advance(200); await echo(); await advance();
    expect(reads).toHaveLength(2);
    await act(async () => { reads[1].finish([pinned(), rows()[1]]); });
    await advance(10_000);
    expect(reads).toHaveLength(2);
    expect(reads.some((read) => read.signal.aborted)).toBe(false);
  });

  it("reads the list once when the write's echo never arrives", async () => {
    await mount();
    const acknowledge = await startWrite();
    await acknowledge();
    expect(reads).toHaveLength(1);
    await advance(10_000);
    expect(reads).toHaveLength(2);
    await act(async () => { reads[1].finish([pinned(), rows()[1]]); });
    await advance(10_000);
    expect(reads).toHaveLength(2);
  });

  it("supersedes a list read that started during the write", async () => {
    await mount();
    const acknowledge = await startWrite();
    await echo(); await advance();
    expect(reads).toHaveLength(2);
    await acknowledge();
    expect(reads[1].signal.aborted).toBe(true);
    expect(reads).toHaveLength(3);
  });

  it("repeats a list read that the write interrupted", async () => {
    await mount();
    await echo(); await advance();
    expect(reads).toHaveLength(2);
    const acknowledge = await startWrite();
    expect(reads[1].signal.aborted).toBe(true);
    await acknowledge();
    expect(reads).toHaveLength(3);
  });

  it("does not read a retired account's list after its write", async () => {
    await mount(true);
    const acknowledge = await startWrite();
    await acknowledge();
    auth.user = null;
    await render(true); await advance();
    await advance(10_000);
    expect(reads).toHaveLength(1);
  });
});
