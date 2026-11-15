import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DesktopBridge } from "./bridge";
import { DESKTOP_IPC } from "./ipc-contract";
import { desktopLaunchFlag } from "./launch-state";
import { notificationCapabilitiesForPlatform } from "./notification-capabilities";

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(async () => undefined),
}));
vi.mock("../../desktop/node_modules/electron", () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: mocks,
}));

const argv = process.argv;
let bridge: DesktopBridge & Record<string, unknown>;

async function loadPreload(extraArgs: string[] = []) {
  vi.resetModules();
  vi.clearAllMocks();
  process.argv = [...argv, ...extraArgs];
  await import("../../desktop/src/preload");
  bridge = mocks.exposeInMainWorld.mock.calls[0][1] as typeof bridge;
}

beforeEach(() => loadPreload());
afterEach(() => {
  process.argv = argv;
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

describe("desktop preload window material", () => {
  it("subscribes before asking for a replay and drops malformed states", () => {
    const handler = vi.fn();
    const unsubscribe = bridge.onWindowMaterialChange!(handler);
    const [channel, listener] = mocks.on.mock.calls[0];
    expect(channel).toBe("minddy:window-material-state");
    expect(mocks.send).toHaveBeenCalledWith("minddy:window-material-ready");
    expect(mocks.on.mock.invocationCallOrder[0]).toBeLessThan(mocks.send.mock.invocationCallOrder[0]);
    listener({}, { kind: "mica" });
    expect(handler).not.toHaveBeenCalled();
    const state = { supported: true, enabled: false, reducedTransparency: false, kind: "none" };
    listener({}, state);
    expect(handler).toHaveBeenCalledExactlyOnceWith(state);
    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(channel, listener);
  });

  it("sends only a boolean preference", async () => {
    await bridge.setWindowMaterialEnabled?.("yes" as unknown as boolean);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("minddy:window-material:set", false);
  });
});

describe("desktop preload launch state", () => {
  it("exposes what the main process wrote on the command line", async () => {
    const capabilities = notificationCapabilitiesForPlatform("darwin", true);
    await loadPreload([
      desktopLaunchFlag({
        version: "0.31.0",
        integratedWindowChrome: true,
        notificationCapabilities: capabilities,
        windowMaterial: null,
      }),
    ]);
    expect(bridge).toMatchObject({ version: "0.31.0", integratedWindowChrome: true, notificationCapabilities: capabilities });
    expect(bridge.windowMaterial).toBeUndefined();
    expect(bridge.registerForPushNotifications).toBeTypeOf("function");
    expect(bridge.openNotificationSettings).toBeTypeOf("function");
  });

  it("offers no native push or settings member the shell cannot back", () => {
    expect(bridge.notificationCapabilities?.backgroundTransport).toBeNull();
    expect(bridge.registerForPushNotifications).toBeUndefined();
    expect(bridge.unregisterForPushNotifications).toBeUndefined();
    expect(bridge.openNotificationSettings).toBeUndefined();
  });
});

describe("desktop preload against the IPC contract", () => {
  /** Calls every member, nested ones included, and collects the channels they use. */
  function channelsUsedByMembers(): Set<string> {
    const visit = (value: unknown) => {
      if (typeof value === "function") (value as (...args: unknown[]) => unknown)(() => {});
      else if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(bridge);
    return new Set(
      [...mocks.invoke.mock.calls, ...mocks.send.mock.calls, ...mocks.on.mock.calls].map(([channel]) => channel as string),
    );
  }

  it("uses every renderer-facing channel of the contract, and no other", async () => {
    await loadPreload([
      desktopLaunchFlag({
        version: "0.31.0",
        integratedWindowChrome: false,
        notificationCapabilities: notificationCapabilitiesForPlatform("darwin", true),
        windowMaterial: null,
      }),
    ]);
    const used = channelsUsedByMembers();
    const declared = Object.entries(DESKTOP_IPC).flatMap(([channel, entry]) =>
      entry.kind === "state" ? [channel, entry.ready, ...(entry.notReady ? [entry.notReady] : [])] : [channel],
    );
    // `notReady` is sent on unsubscribe, which the walk above does not do.
    const unsubscribed = Object.values(DESKTOP_IPC).flatMap((entry) =>
      entry.kind === "state" && entry.notReady ? [entry.notReady] : [],
    );
    expect([...used].sort()).toEqual(declared.filter((channel) => !unsubscribed.includes(channel)).sort());
  });

  it("keeps the retired members old self-hosted pages call, without reaching the main process", async () => {
    const retired = bridge as unknown as {
      setWindowButtonsVisible(visible: boolean): void;
      localRepo(input: unknown): Promise<unknown>;
      chooseLocalRepo(input: unknown): Promise<unknown>;
      forgetLocalRepo(input: unknown): Promise<unknown>;
      discoverLocalModels(input: unknown): Promise<unknown>;
    };
    expect(() => retired.setWindowButtonsVisible(false)).not.toThrow();
    await expect(retired.chooseLocalRepo({ projectId: "p" })).resolves.toEqual({ status: "none" });
    await expect(retired.forgetLocalRepo({ projectId: "p" })).resolves.toEqual({ status: "none" });
    await expect(retired.discoverLocalModels({ provider: "ollama", baseUrl: "http://127.0.0.1:11434" }))
      .resolves.toMatchObject({ ok: false });
    const settled = vi.fn();
    void retired.localRepo({ projectId: "p" }).then(settled, settled);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
