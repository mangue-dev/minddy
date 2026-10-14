// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsRestoringProvider, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs } from "@/lib/app-tabs-context";
import { createHomeTab, type AppTab } from "@/lib/app-tabs";
import { invalidateLocalSnapshotWrites } from "@/lib/local-snapshots";
import { appTabPreparationQueries } from "@/lib/prefetch-tab-destination";

const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, sdkOwner: "owner" }));
const viewport = vi.hoisted(() => ({ mobile: false as boolean | undefined }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => viewport.mobile }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: auth.sdkOwner } } }, error: null }),
} }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));
vi.mock("@/lib/use-pr-background", () => ({ PrBackgroundSync: () => null }));
vi.mock("@/lib/app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn(), isAppTabSurfaceReady: () => true }));

interface PendingRead {
  signal: AbortSignal;
  finish: (value: unknown, status?: number) => void;
}
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let value: ReturnType<typeof useOptionalAppTabs>;
let reads: PendingRead[];
let writes: string[];
const firstId = "10000000-0000-0000-0000-000000000001";
const secondId = "10000000-0000-0000-0000-000000000002";
const thirdId = "10000000-0000-0000-0000-000000000003";
const rows = (owner = "owner"): AppTab[] => [createHomeTab(owner, firstId),
  { ...createHomeTab(owner, secondId, 1), href: "/projects/new" },
  { ...createHomeTab(owner, thirdId, 2), href: "/projects/other" }];
let projectReads: Array<{ path: string; signal: AbortSignal; finish: () => void }>;
let finishForeground: (() => void) | undefined;
const snapshot = (owner: string) => ({ format: "minddy-local-v1", owner, expiresAt: Date.now() + 60_000, ciphertext: `sealed-${owner}` });
function Probe() {
  value = useOptionalAppTabs();
  useQuery({ queryKey: ["categories", "new"], enabled: value?.activeId === secondId, staleTime: 0,
    queryFn: () => new Promise<unknown[]>((resolve) => { finishForeground = () => resolve([]); }) });
  return createElement("span", null, value?.activeId ?? "Pending");
}
async function render() {
  const tree = createElement(QueryClientProvider, { client },
    createElement(IsRestoringProvider, { value: false },
      createElement(AppTabsProvider, { children: createElement(Probe) })));
  await act(() => root.render(tree));
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
  projectReads = []; finishForeground = undefined;
  reads = []; writes = []; value = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 300_000 } } });
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/me/app-tabs" && !init?.method) return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      reads.push({ signal, finish: (body, status = 200) => resolve(Response.json(body, { status })) });
    });
    if (url === "/api/me/local-snapshots") {
      const body = JSON.parse(String(init?.body));
      if (body.operation === "open") return Promise.resolve(Response.json({ value: null }));
      return Promise.resolve(Response.json({ snapshot: snapshot(auth.sdkOwner) }));
    }
    if (String(url).startsWith("/api/projects/") && String(url).endsWith("/issues")) return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal as AbortSignal;
      projectReads.push({ path: String(url), signal, finish: () => resolve(Response.json([])) });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
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
  finishForeground?.(); for (const read of projectReads) read.finish();
  client.clear();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("mounted AccountTabSync foreground handoff", () => {
  it("publishes the selected scope before a child foreground query can cancel its unobserved shared read", async () => {
    for (const row of rows()) for (const option of appTabPreparationQueries(client, row.href)) {
      if (option.queryKey[0] !== "issues") client.setQueryData(option.queryKey, []);
    }
    await render();
    reads[0].finish(rows()); await settle();
    await vi.waitFor(() => expect(projectReads).toHaveLength(2));
    const selected = projectReads.find((read) => read.path.endsWith("/new/issues"))!;
    const other = projectReads.find((read) => read.path.endsWith("/other/issues"))!;
    expect(client.getQueryCache().find({ queryKey: ["issues", "new"], exact: true })?.getObserversCount()).toBe(0);
    await act(async () => { await value!.session.activate(secondId); }); await settle();
    expect(value?.activeId).toBe(secondId);
    expect(client.getQueryState(["categories", "new"])?.fetchStatus).toBe("fetching");
    expect(finishForeground).toBeDefined();
    expect(selected.signal.aborted).toBe(false);
    expect(other.signal.aborted).toBe(true);
    expect(projectReads.filter((read) => read.path === selected.path)).toHaveLength(1);
    selected.finish(); finishForeground!(); await settle();
    await vi.waitFor(() => expect(client.getQueryState(["issues", "new"])?.status).toBe("success"));
    expect(projectReads.filter((read) => read.path === selected.path)).toHaveLength(1);
    expect(writes).toEqual([]);
  });
});
