import { describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "./bridge";
import { subscribeWindowsStoreUpdate } from "./use-windows-store-update";

describe("subscribeWindowsStoreUpdate", () => {
  it("does nothing for an older shell without Store update support", () => {
    const handler = vi.fn();
    const bridge = {} satisfies Pick<
      DesktopBridge,
      "onWindowsStoreUpdateStatus"
    >;
    const unsubscribe = subscribeWindowsStoreUpdate(bridge, handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards availability and returns the shell unsubscriber", () => {
    const unsubscribe = vi.fn();
    const handler = vi.fn();
    const bridge = {
      onWindowsStoreUpdateStatus(callback: (available: boolean) => void) {
        callback(true);
        return unsubscribe;
      },
    } satisfies Pick<DesktopBridge, "onWindowsStoreUpdateStatus">;

    expect(subscribeWindowsStoreUpdate(bridge, handler)).toBe(unsubscribe);
    expect(handler).toHaveBeenCalledWith(true);
  });
});
