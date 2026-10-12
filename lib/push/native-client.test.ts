import { afterEach, describe, expect, it, vi } from "vitest";

import { unsubscribeThisDevice } from "./client";

const native = vi.hoisted(() => ({
  notificationCapabilities: { backgroundTransport: "apns" },
  registerForPushNotifications: vi.fn(),
  unregisterForPushNotifications: vi.fn(),
}));
vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => native }));

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("native push removal", () => {
  it("persists opt-out even when reading the native endpoint fails", async () => {
    native.registerForPushNotifications.mockRejectedValue(new Error("Permission revoked"));
    await expect(unsubscribeThisDevice()).resolves.toBeNull();
    expect(native.unregisterForPushNotifications).toHaveBeenCalledOnce();
  });

  it("does not let a stalled native endpoint lookup prevent opt-out", async () => {
    vi.useFakeTimers();
    native.registerForPushNotifications.mockReturnValue(new Promise(() => {}));
    const removing = unsubscribeThisDevice();
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(removing).resolves.toBeNull();
    expect(native.unregisterForPushNotifications).toHaveBeenCalledOnce();
  });

  it("retains the endpoint for removal after a successful native lookup", async () => {
    native.registerForPushNotifications.mockResolvedValue({ endpoint: "native-endpoint" });
    await expect(unsubscribeThisDevice()).resolves.toBe("native-endpoint");
    expect(native.unregisterForPushNotifications).toHaveBeenCalledOnce();
  });

  it("reports a failure to persist native opt-out", async () => {
    native.registerForPushNotifications.mockRejectedValue(new Error("Helper unavailable"));
    native.unregisterForPushNotifications.mockRejectedValue(new Error("Read-only profile"));
    await expect(unsubscribeThisDevice()).rejects.toThrow("Read-only profile");
  });
});
