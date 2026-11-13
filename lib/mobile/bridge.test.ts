import { afterEach, describe, expect, it, vi } from "vitest";

import { getMobileBridge, isNativeMobile } from "./bridge";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubCapacitor(capacitor: unknown) {
  vi.stubGlobal("window", { Capacitor: capacitor });
}

describe("the mobile bridge", () => {
  it("is absent on the server and in a browser", () => {
    expect(getMobileBridge()).toBeNull();
    vi.stubGlobal("window", {});
    expect(isNativeMobile()).toBe(false);
  });

  it("ignores the web build of Capacitor, which is not a native app", () => {
    stubCapacitor({ isNativePlatform: () => false, getPlatform: () => "web" });
    expect(isNativeMobile()).toBe(false);
  });

  it("rejects a platform it does not know", () => {
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "electron" });
    expect(getMobileBridge()).toBeNull();
  });

  it("reports the platform and the shell plugin inside the app", () => {
    const shell = { openServerPicker: vi.fn() };
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { MinddyShell: shell } });
    expect(getMobileBridge()).toEqual({ platform: "ios", shell });
    expect(isNativeMobile()).toBe(true);
  });

  it("still detects the app when the shell plugin is missing", () => {
    stubCapacitor({ isNativePlatform: () => true, getPlatform: () => "android" });
    expect(getMobileBridge()).toEqual({ platform: "android", shell: null });
  });
});
