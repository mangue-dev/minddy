import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createPrDiffRuntimePreparation } from "./pr-diff-runtime-preparation";

type Runtime = typeof import("@/components/pull-requests/pr-diff-workers");

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (let i = 0; i < 6; i++) client.setQueryData(["pull-request", `p${i}`], {
    files: [{ filename: `allowed-${i}.ts`, patch: "private patch" }, { filename: `binary-${i}.png` }],
  });
  const runtime = { PrDiffWorkers: () => null, PrDiffRuntimePreparation: () => null,
    preparedDiffLanguages: vi.fn<Runtime["preparedDiffLanguages"]>(() => ["typescript"]) };
  const load = vi.fn<() => Promise<Runtime>>(async () => runtime as unknown as Runtime);
  const ready = vi.fn();
  const tasks = new Map<() => void, number>();
  const stop = createPrDiffRuntimePreparation(client, ["p0", "p1", "p2", "p3", "p4", "p5"], ready, load,
    (task, delay) => { tasks.set(task, delay); return () => { tasks.delete(task); }; });
  const flush = async () => {
    for (const [task, delay] of Array.from(tasks)) if (delay <= 50) { tasks.delete(task); task(); }
    await Promise.resolve(); await Promise.resolve();
  };
  return { client, runtime, load, ready, tasks, stop, flush };
}

it("prepares public runtime once for the bounded recent cohort without copying patches or refetching", async () => {
  const view = setup();
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  try {
    await view.flush(); await view.flush();
    expect(view.load).toHaveBeenCalledTimes(1);
    expect(view.runtime.preparedDiffLanguages).toHaveBeenCalledWith(Array.from({ length: 5 }, (_, i) => `allowed-${i}.ts`));
    expect(view.ready).toHaveBeenCalledWith({ Surface: view.runtime.PrDiffRuntimePreparation, languages: ["typescript"] });
    view.client.setQueryData(["unrelated"], true); await view.flush();
    expect(view.ready).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  } finally { view.stop(); view.client.clear(); }
});

it("waits for foreground transport, then prepares when it settles", async () => {
  const view = setup();
  let finish!: (value: boolean) => void;
  const request = view.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => new Promise<boolean>((resolve) => { finish = resolve; }) });
  try {
    await view.flush(); expect(view.load).not.toHaveBeenCalled();
    finish(true); await request; await view.flush(); await view.flush();
    expect(view.ready).toHaveBeenCalledTimes(1);
  } finally { view.stop(); view.client.clear(); }
});

it("retires delayed public imports without mounting a pool in a departed account", async () => {
  const view = setup();
  let finish!: (value: Awaited<ReturnType<typeof view.load>>) => void;
  view.load.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await view.flush(); view.stop();
  finish(view.runtime as unknown as Runtime);
  await view.flush();
  expect(view.ready).not.toHaveBeenCalled(); expect(view.tasks.size).toBe(0);
  view.client.clear();
});

it("shares an idle window with unobserved preparation but yields when a foreground observer joins", async () => {
  const view = setup();
  let finish!: (value: boolean) => void;
  const options = { queryKey: ["pr-comments", "p0"], queryFn: () => new Promise<boolean>((resolve) => { finish = resolve; }) };
  const request = view.client.fetchQuery(options);
  let loaded!: (runtime: Runtime) => void;
  view.load.mockImplementation(() => new Promise((resolve) => { loaded = resolve; }));
  let unobserve: (() => void) | undefined;
  try {
    await view.flush(); expect(view.load).toHaveBeenCalledTimes(1);
    const observer = new QueryObserver(view.client, options);
    unobserve = observer.subscribe(() => {});
    loaded(view.runtime as unknown as Runtime); await view.flush(); await view.flush();
    expect(view.ready).not.toHaveBeenCalled();
    finish(true); await request; await view.flush();
    expect(view.ready).toHaveBeenCalledTimes(1);
  } finally { unobserve?.(); view.stop(); view.client.clear(); }
});

it("does not loop on failed public imports", async () => {
  vi.useFakeTimers();
  const view = setup();
  view.load.mockRejectedValue(new Error("Unavailable public chunk"));
  try {
    await view.flush(); await view.flush();
    view.client.setQueryData(["unrelated"], true); await view.flush();
    expect(view.load).toHaveBeenCalledTimes(1);
    expect([...view.tasks.values()]).toEqual([60_000]);
    await vi.advanceTimersByTimeAsync(60_000);
    view.client.setQueryData(["unrelated"], false); await view.flush();
    expect(view.load).toHaveBeenCalledTimes(2);
  } finally { view.stop(); view.client.clear(); }
});
