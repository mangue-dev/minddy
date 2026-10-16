// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "reader" } } }, error: null }),
} }) }));
import { fetchPullRequestReadinessBatchApi } from "./agent-api";
import { assertPullRequestReadBudget, pullRequestAccountRetryAt, pullRequestQueryOptions } from "./pull-request-query";
import { usePullRequestReadinessBatchQuery } from "./use-agent-runs";

const accepted = { state: "merged", blockers: [], passed: [], mergeAllowed: false,
  methods: [], preferredMethod: null };
const partial = { readiness: { accepted }, unavailablePrIds: ["unknown"], retryStatus: 429 };
let root: Root | undefined, host: HTMLElement | undefined, client: QueryClient;
let current: ReturnType<typeof usePullRequestReadinessBatchQuery>;
function Harness() { current = usePullRequestReadinessBatchQuery(["accepted", "unknown"]); return null; }
async function mount() {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => { root!.render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);
    await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
  focusManager.setFocused(true);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; host?.remove(); host = undefined;
  client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); focusManager.setFocused(undefined);
});

describe("successful partial batch Retry-After", () => {
  it.each(["125", "Wed, 14 Oct 2026 15:02:05 GMT"])("keeps accepted rows and waits for %s before polling again", async (retryAfter) => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json(partial, { headers: { "Retry-After": retryAfter } }))
      .mockResolvedValue(Response.json({ readiness: { accepted }, unavailablePrIds: [] }));
    vi.stubGlobal("fetch", fetch);
    await mount(); expect(current.readinessByPrId.accepted).toEqual(accepted);
    expect(current.unavailablePrIds.has("unknown")).toBe(true); expect(current.error).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(124_998); });
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); });
    expect(fetch).toHaveBeenCalledTimes(2); expect(current.unavailablePrIds.size).toBe(0);
  });

  it("shares a successful batch deadline with other foreground reads in the account only", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(partial, { headers: { "Retry-After": "180" } }));
    vi.stubGlobal("fetch", fetch);
    await client.fetchQuery({ queryKey: ["pull-request-readiness", "batch", ["accepted", "unknown"]],
      queryFn: () => fetchPullRequestReadinessBatchApi(["accepted", "unknown"]) });
    expect(pullRequestAccountRetryAt(client)).toBe(Date.now() + 180_000);
    expect(() => assertPullRequestReadBudget(client)).toThrow();
    await expect(client.fetchQuery(pullRequestQueryOptions("other"))).rejects.toMatchObject({ status: 429, retryAt: Date.now() + 180_000 });
    expect(fetch).toHaveBeenCalledOnce();
    const nextAccount = new QueryClient(); expect(() => assertPullRequestReadBudget(nextAccount)).not.toThrow(); nextAccount.clear();
  });

  it("uses an HTTP error deadline instead of the settled polling cadence", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: "Quota exhausted" }, { status: 429, headers: { "Retry-After": "125" } }))
      .mockResolvedValue(Response.json({ readiness: { accepted }, unavailablePrIds: [] }));
    vi.stubGlobal("fetch", fetch); await mount(); expect(current.error).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(124_998); }); expect(fetch).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(2); }); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["partial", "http-error"])("does not bypass or slide a %s deadline on focus, invalidation or remount", async (responseKind) => {
    const first = responseKind === "partial"
      ? Response.json(partial, { headers: { "Retry-After": "125" } })
      : Response.json({ error: "Quota exhausted" }, { status: 429, headers: { "Retry-After": "125" } });
    const fetch = vi.fn().mockResolvedValueOnce(first)
      .mockResolvedValue(Response.json({ readiness: { accepted }, unavailablePrIds: [] }));
    vi.stubGlobal("fetch", fetch); await mount();
    const deadline = pullRequestAccountRetryAt(client);
    await act(async () => {
      focusManager.setFocused(false); focusManager.setFocused(true);
      await vi.advanceTimersByTimeAsync(1);
      await client.invalidateQueries({ queryKey: ["pull-request-readiness"] });
    });
    expect(fetch).toHaveBeenCalledOnce(); expect(pullRequestAccountRetryAt(client)).toBe(deadline);
    await act(async () => root!.unmount()); root = undefined; host?.remove();
    await mount(); expect(fetch).toHaveBeenCalledOnce();
    expect(pullRequestAccountRetryAt(client)).toBe(deadline);
    if (responseKind === "partial") expect(current.readinessByPrId.accepted).toEqual(accepted);
    await act(async () => { await vi.advanceTimersByTimeAsync(deadline - Date.now()); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps successful quota data plain and gates restored metadata without extending its deadline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(partial, { headers: { "Retry-After": "180" } })));
    const data = await fetchPullRequestReadinessBatchApi(["accepted", "unknown"]);
    const restored = JSON.parse(JSON.stringify(data));
    expect(restored).toEqual(data);
    client.setQueryData(["pull-request-readiness", "batch", ["accepted", "unknown"]], restored);
    const deadline = pullRequestAccountRetryAt(client);
    expect(deadline).toBe(Date.now() + 180_000);
    vi.advanceTimersByTime(40_000); expect(() => assertPullRequestReadBudget(client)).toThrow();
    expect(pullRequestAccountRetryAt(client)).toBe(deadline);
    vi.advanceTimersByTime(140_000); expect(() => assertPullRequestReadBudget(client)).not.toThrow();
    expect(pullRequestAccountRetryAt(client)).toBe(0);
  });
});
