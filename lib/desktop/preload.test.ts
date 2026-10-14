import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "./bridge";

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn(() => "0.11.1"),
}));
vi.mock("../../desktop/node_modules/electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: mocks,
}));

let bridge: DesktopBridge;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  await import("../../desktop/src/preload");
  bridge = mocks.exposeInMainWorld.mock.calls[0][1] as DesktopBridge;
});

describe("desktop preload auth subscription", () => {
  it("registers before requesting a pending link, then announces cleanup", () => {
    const handler = vi.fn();
    const unsubscribe = bridge.onAuthLink(handler);
    const [channel, listener] = mocks.on.mock.calls[0];
    expect(channel).toBe("minddy:auth-link");
    expect(mocks.on.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    expect(mocks.send).toHaveBeenCalledWith("minddy:auth-link-ready");
    const link = { code: "auth-code", next: "/inbox" };
    listener({}, link);
    expect(handler).toHaveBeenCalledWith(link);

    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(channel, listener);
    expect(mocks.send).toHaveBeenLastCalledWith("minddy:auth-link-not-ready");
  });
});

describe("desktop preload storage flush", () => {
  it("asks the main process to commit DOM storage without passing page input", async () => {
    const invoke = vi.fn(async () => undefined);
    Object.assign(mocks, { invoke });
    await bridge.flushStorage?.();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("minddy:storage:flush");
  });
});
