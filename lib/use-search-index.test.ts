// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { navigationPreparationPending, navigationPreparationPriority, subscribeNavigationPreparation } from "./navigation-preparation-priority";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  scheduleSearchIndexArm, useSearchIndex,
  SEARCH_INDEX_ARM_DELAY_MS,
  SEARCH_INDEX_IDLE_TIMEOUT_MS,
  type SearchIndexArmScheduler,
} from "./use-search-index";

describe("scheduleSearchIndexArm", () => {
  it("waits for pending navigation to finish and retires its priority listener after arming", () => {
    const client = new QueryClient(); const priority = navigationPreparationPriority(client);
    const delayed: Array<() => void> = []; const arm = vi.fn();
    const scheduler = { setTimeout: (callback: () => void) => { delayed.push(callback); return 1; }, clearTimeout: vi.fn() };
    priority.acquire();
    const cancel = scheduleSearchIndexArm(scheduler, arm, {
      pending: () => navigationPreparationPending(client), subscribe: (changed) => subscribeNavigationPreparation(client, changed),
    });
    delayed[0](); expect(arm).not.toHaveBeenCalled();
    priority.startRead(["issues", "project"]); expect(arm).not.toHaveBeenCalled();
    priority.release(); expect(arm).toHaveBeenCalledOnce();
    priority.acquire(); priority.release(); expect(arm).toHaveBeenCalledOnce();
    cancel(); client.clear();
  });

  it("does not arm a retired account after pending navigation releases", () => {
    const client = new QueryClient(); const priority = navigationPreparationPriority(client);
    const delayed: Array<() => void> = []; const arm = vi.fn();
    const scheduler = { setTimeout: (callback: () => void) => { delayed.push(callback); return 1; }, clearTimeout: vi.fn() };
    priority.acquire();
    const cancel = scheduleSearchIndexArm(scheduler, arm, {
      pending: () => navigationPreparationPending(client), subscribe: (changed) => subscribeNavigationPreparation(client, changed),
    });
    delayed[0](); cancel(); priority.release(); delayed[0]();
    expect(arm).not.toHaveBeenCalled(); client.clear();
  });

  it("waits for the startup delay before requesting idle time", () => {
    const delayed: Array<() => void> = [];
    const idle: Array<() => void> = [];
    const arm = vi.fn();
    const requestIdleCallback = vi.fn((callback: () => void, options: { timeout: number }) => {
      expect(options.timeout).toBe(SEARCH_INDEX_IDLE_TIMEOUT_MS);
      idle.push(callback);
      return 2;
    });
    const scheduler: SearchIndexArmScheduler = {
      setTimeout: (callback, delay) => {
        expect(delay).toBe(SEARCH_INDEX_ARM_DELAY_MS);
        delayed.push(callback);
        return 1;
      },
      clearTimeout: vi.fn(),
      requestIdleCallback,
      cancelIdleCallback: vi.fn(),
    };

    scheduleSearchIndexArm(scheduler, arm);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(arm).not.toHaveBeenCalled();

    delayed[0]();
    expect(arm).not.toHaveBeenCalled();
    idle[0]();
    expect(arm).toHaveBeenCalledOnce();
  });

  it("arms after the delay when requestIdleCallback is unavailable", () => {
    const delayed: Array<() => void> = [];
    const arm = vi.fn();
    const scheduler: SearchIndexArmScheduler = {
      setTimeout: (callback) => {
        delayed.push(callback);
        return 1;
      },
      clearTimeout: vi.fn(),
    };

    scheduleSearchIndexArm(scheduler, arm);
    expect(arm).not.toHaveBeenCalled();
    delayed[0]();
    expect(arm).toHaveBeenCalledOnce();
  });

  it("cancels both pending stages", () => {
    const delayed: Array<() => void> = [];
    const scheduler: SearchIndexArmScheduler = {
      setTimeout: (callback) => {
        delayed.push(callback);
        return 1;
      },
      clearTimeout: vi.fn(),
      requestIdleCallback: () => 2,
      cancelIdleCallback: vi.fn(),
    };

    const cancel = scheduleSearchIndexArm(scheduler, vi.fn());
    delayed[0]();
    cancel();

    expect(scheduler.clearTimeout).toHaveBeenCalledWith(1);
    expect(scheduler.cancelIdleCallback).toHaveBeenCalledWith(2);
  });
});

let root: Root | undefined;
const clients: QueryClient[] = [];
afterEach(async () => {
  if (root) await act(() => root?.unmount()); root = undefined;
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("lets explicit palette intent fetch immediately while automatic indexing waits for navigation", async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const priority = navigationPreparationPriority(client); priority.acquire();
  const fetch = vi.fn(async () => Response.json({ issues: [], objectives: [], pages: [] })); vi.stubGlobal("fetch", fetch);
  let index!: ReturnType<typeof useSearchIndex>;
  function Palette() { index = useSearchIndex(); return null; }
  root = createRoot(document.createElement("div"));
  try {
    await act(() => root!.render(createElement(QueryClientProvider, { client }, createElement(Palette))));
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_INDEX_ARM_DELAY_MS + SEARCH_INDEX_IDLE_TIMEOUT_MS); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { index.armNow(); await vi.advanceTimersByTimeAsync(1); });
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(index.index).not.toBeNull();
    priority.release(); await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(fetch).toHaveBeenCalledOnce();
  } finally { priority.release(); }
});
