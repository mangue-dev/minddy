import { describe, expect, it, vi } from "vitest";
import {
  scheduleSearchIndexArm,
  SEARCH_INDEX_ARM_DELAY_MS,
  SEARCH_INDEX_IDLE_TIMEOUT_MS,
  type SearchIndexArmScheduler,
} from "./use-search-index";

describe("scheduleSearchIndexArm", () => {
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
