import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HAPTIC_COALESCE_MS,
  haptic,
  hapticOptimistic,
  hapticOutcome,
  installClipboardHaptics,
  resetHapticsForTests,
  resolveHaptics,
  setHapticsEnabled,
} from "./haptics";

function stubShell() {
  const shell = {
    haptic: vi.fn(() => Promise.resolve()),
    setHaptics: vi.fn(() => Promise.resolve()),
  };
  vi.stubGlobal("window", {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { MinddyShell: shell } },
  });
  return shell;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetHapticsForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("haptics", () => {
  it("does nothing in a browser", () => {
    vi.stubGlobal("window", {});
    expect(() => haptic("selection")).not.toThrow();
  });

  it("does nothing in an older shell without the method", () => {
    vi.stubGlobal("window", {
      Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { MinddyShell: {} } },
    });
    expect(() => haptic("success")).not.toThrow();
  });

  it("asks the shell for the requested kind", () => {
    const shell = stubShell();
    haptic("selection");
    haptic("error");
    expect(shell.haptic.mock.calls).toEqual([[{ kind: "selection" }], [{ kind: "error" }]]);
  });

  it("plays a burst of the same kind once", () => {
    const shell = stubShell();
    haptic("success");
    haptic("success");
    expect(shell.haptic).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HAPTIC_COALESCE_MS);
    haptic("success");
    expect(shell.haptic).toHaveBeenCalledTimes(2);
  });

  it("stays silent while the account switch is off, and tells the shell", () => {
    const shell = stubShell();
    setHapticsEnabled(false);
    expect(shell.setHaptics).toHaveBeenCalledWith({ enabled: false });
    haptic("selection");
    expect(shell.haptic).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    haptic("selection");
    expect(shell.haptic).toHaveBeenCalledTimes(1);
  });

  it("plays the outcome of a key action and passes its result through", async () => {
    const shell = stubShell();
    await expect(hapticOutcome(Promise.resolve(42))).resolves.toBe(42);
    expect(shell.haptic).toHaveBeenLastCalledWith({ kind: "success" });
    const failure = new Error("nope");
    await expect(hapticOutcome(Promise.reject(failure))).rejects.toBe(failure);
    expect(shell.haptic).toHaveBeenLastCalledWith({ kind: "error" });
  });

  it("plays a creation at once, before the server answers, and its failure later", async () => {
    const shell = stubShell();
    let fail!: (error: Error) => void;
    const creation = hapticOptimistic(new Promise<number>((_resolve, reject) => { fail = reject; }));
    expect(shell.haptic.mock.calls).toEqual([[{ kind: "success" }]]);
    const failure = new Error("nope");
    fail(failure);
    await expect(creation).rejects.toBe(failure);
    expect(shell.haptic).toHaveBeenLastCalledWith({ kind: "error" });
  });

  it("ticks after each successful copy, and not after a refused one", async () => {
    const shell = stubShell();
    const writeText = vi.fn((text: string) => (text ? Promise.resolve() : Promise.reject(new Error("denied"))));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const uninstall = installClipboardHaptics();
    await navigator.clipboard.writeText("MIN-959");
    expect(writeText).toHaveBeenCalledWith("MIN-959");
    expect(shell.haptic).toHaveBeenLastCalledWith({ kind: "selection" });
    vi.advanceTimersByTime(HAPTIC_COALESCE_MS);
    await expect(navigator.clipboard.writeText("")).rejects.toThrow("denied");
    expect(shell.haptic).toHaveBeenCalledTimes(1);
    uninstall();
    expect(navigator.clipboard.writeText).toBe(writeText);
  });

  it("leaves the clipboard alone in a browser", () => {
    vi.stubGlobal("window", {});
    const writeText = vi.fn();
    const clipboard = { writeText };
    vi.stubGlobal("navigator", { clipboard });
    installClipboardHaptics();
    expect(clipboard.writeText).toBe(writeText);
  });

  it("is on unless the account turned it off", () => {
    expect(resolveHaptics(undefined)).toBe(true);
    expect(resolveHaptics({})).toBe(true);
    expect(resolveHaptics({ haptics: true })).toBe(true);
    expect(resolveHaptics({ haptics: false })).toBe(false);
  });
});
