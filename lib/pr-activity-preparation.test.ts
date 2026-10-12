import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./agent-api";
import { createPrActivityPreparation } from "./pr-activity-preparation";
import { prCommentsQueryOptions } from "./pr-activity-query";
import { setPrReactionOptimistically } from "./optimistic/pr-reaction-writes";

vi.mock("./supabase", () => ({ getSupabase: () => ({ auth: {
  getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }),
} }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function setup(ids = ["p0", "p1", "p2", "p3", "p4", "outside"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  ids.forEach((id) => client.setQueryData(["pull-request", id], { pr: { title: id } }));
  const tasks = new Map<() => void, number>();
  const preparation = createPrActivityPreparation(client, (task, delay) => {
    tasks.set(task, delay); return () => { tasks.delete(task); };
  });
  const flush = () => { for (const [task, delay] of Array.from(tasks)) if (delay <= 300) { tasks.delete(task); task(); } };
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => Response.json(String(url).endsWith("/commits")
    ? { commits: [], truncated: false } : { comments: [], timeline: [], threads: [], reactions: [] }));
  vi.stubGlobal("fetch", fetch);
  preparation.update(ids);
  return { client, tasks, preparation, flush, fetch };
}

async function drain(prepared: ReturnType<typeof setup>) {
  for (let i = 0; i < 20; i++) {
    prepared.flush();
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    await Promise.resolve();
    if (![...prepared.tasks.values()].some((delay) => delay <= 300)) return;
  }
  throw new Error("Activity preparation did not settle");
}

describe("account-owned PR activity preparation", () => {
  it("prepares only five successful details with at most three reads, without refetching fresh data", async () => {
    const prepared = setup();
    let concurrent = 0, maximum = 0;
    const respond = prepared.fetch.getMockImplementation()!;
    prepared.fetch.mockImplementation(async (...args) => {
      maximum = Math.max(maximum, ++concurrent);
      await Promise.resolve(); concurrent--;
      return respond(...args);
    });
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(15);
    expect(maximum).toBe(3);
    expect(prepared.fetch.mock.calls.some(([url]) => String(url).includes("outside"))).toBe(false);
    expect(prepared.client.getQueryData(["pr-commits", "p4"])).toEqual({ commits: [], truncated: false });
    prepared.preparation.update(["p0", "p1", "p2", "p3", "p4"]);
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(15);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("yields unobserved transport while preserving a foreground observer's joined read", async () => {
    const prepared = setup();
    const signals: AbortSignal[] = [];
    const releases: Array<(value: Response) => void> = [];
    prepared.fetch.mockImplementation((_url, init) => new Promise((resolve, reject) => {
      const signal = init!.signal as AbortSignal;
      signals.push(signal); releases.push(resolve);
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    prepared.flush();
    await vi.waitFor(() => expect(signals).toHaveLength(3));
    const observer = new QueryObserver(prepared.client, prCommentsQueryOptions("p0"));
    const stop = observer.subscribe(() => {});
    let finish!: (value: string) => void;
    const foreground = prepared.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise<string>((resolve) => { finish = resolve; }) });
    await vi.waitFor(() => expect(signals.slice(1).every((signal) => signal.aborted)).toBe(true));
    expect(signals[0].aborted).toBe(false);
    releases[0](Response.json({ comments: [], timeline: [], reactions: [] }));
    finish("done"); await foreground;
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    stop(); prepared.preparation.dispose(); prepared.client.clear();
  });

  it("respects account Retry-After and does not loop on failed auxiliary reads", async () => {
    let now = 1_000; vi.spyOn(Date, "now").mockImplementation(() => now);
    const prepared = setup(["p0"]);
    const limited = new ApiError("Limited"); limited.status = 429; limited.retryAt = 61_000;
    await prepared.client.fetchQuery({ queryKey: ["pull-request", "limited"], queryFn: () => { throw limited; } }).catch(() => {});
    prepared.flush();
    expect(prepared.fetch).not.toHaveBeenCalled();
    now = 61_301;
    prepared.fetch.mockResolvedValue(Response.json({ error: "Unavailable" }, { status: 503 }));
    for (const task of Array.from(prepared.tasks.keys())) { prepared.tasks.delete(task); task(); }
    await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(3);
    prepared.preparation.update(["p0"]); await drain(prepared);
    expect(prepared.fetch).toHaveBeenCalledTimes(3);
    prepared.preparation.dispose(); prepared.client.clear();
  });

  it("aborts account-owned reads and retires scheduling when its account unmounts", async () => {
    const prepared = setup(); const signals: AbortSignal[] = [];
    prepared.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      const signal = init!.signal as AbortSignal; signals.push(signal);
      signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    prepared.flush(); await vi.waitFor(() => expect(signals).toHaveLength(3));
    prepared.preparation.dispose();
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    prepared.client.setQueryData(["pull-request", "new"], { pr: {} });
    expect(prepared.tasks.size).toBe(0);
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    prepared.client.clear();
  });

  it("reapplies a confirmed reaction to an older activity preparation response", async () => {
    let now = 10; vi.spyOn(Date, "now").mockImplementation(() => now);
    const prepared = setup(["p0"]);
    const reaction = { commentId: 1, content: "+1" as const, count: 2, mine: false };
    const original = { comments: [], timeline: [], reactions: [reaction] };
    const options = prCommentsQueryOptions("p0");
    prepared.client.setQueryData(options.queryKey, original);
    let release!: (value: Response) => void;
    prepared.fetch.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const read = options.queryFn({ client: prepared.client, signal: new AbortController().signal });
    await vi.waitFor(() => expect(prepared.fetch).toHaveBeenCalledTimes(1));
    now = 20;
    await setPrReactionOptimistically(prepared.client, ["pr-comments", "p0"], { commentId: 1, content: "+1", on: true }, () => Promise.resolve({ on: true }));
    release(Response.json(original));
    expect(await read).toEqual({ ...original, reactions: [{ ...reaction, count: 3, mine: true }] });
    prepared.preparation.dispose(); prepared.client.clear();
  });
});
