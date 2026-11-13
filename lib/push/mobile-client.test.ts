import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Push in the iOS app (MIN-907): APNs through the shell. The permission is
 * asked from the switch only, never by the refresh that runs at every load,
 * and the token reaches the server with the app and gateway it belongs to.
 */

const shell = vi.hoisted(() => ({
  registerForPushNotifications: vi.fn(),
  unregisterForPushNotifications: vi.fn(),
  pushPermission: vi.fn(),
}));
const api = vi.hoisted(() => ({ saveNative: vi.fn() }));

vi.mock("@/lib/mobile/bridge", () => ({ getMobileBridge: () => ({ platform: "ios", shell }) }));
vi.mock("@/lib/desktop/bridge", () => ({ getDesktopBridge: () => null }));
vi.mock("@/lib/push-devices-api", () => ({
  saveNativePushDeviceApi: api.saveNative,
  savePushDeviceApi: vi.fn(),
}));

const client = await import("./client");

const TOKEN = {
  permission: "granted",
  transport: "apns",
  endpoint: `apns:${"ab".repeat(32)}`,
  installationId: "11111111-1111-4111-8111-111111111111",
  platform: "ios",
  environment: "sandbox",
};

afterEach(() => vi.resetAllMocks());

describe("push in the iOS app", () => {
  it("asks iOS from the switch and saves the token with its app and gateway", async () => {
    shell.registerForPushNotifications.mockResolvedValue(TOKEN);
    api.saveNative.mockResolvedValue({ id: "d1", endpoint: TOKEN.endpoint });

    const result = await client.subscribeThisDevice("fr");

    expect(shell.registerForPushNotifications).toHaveBeenCalledWith({ activate: true });
    expect(api.saveNative).toHaveBeenCalledWith(TOKEN.endpoint, "apns", TOKEN.installationId, "fr", {
      target: { platform: "ios", environment: "sandbox" },
    });
    expect(result).toEqual({ ok: true, device: { id: "d1", endpoint: TOKEN.endpoint } });
    expect(client.pushPermission()).toBe("granted");
  });

  it("reports a refusal as denied, with nothing saved", async () => {
    shell.registerForPushNotifications.mockResolvedValue({ permission: "denied" });

    expect(await client.subscribeThisDevice("fr")).toEqual({ ok: false, reason: "denied" });
    expect(api.saveNative).not.toHaveBeenCalled();
    expect(client.pushPermission()).toBe("denied");
  });

  it("renews an allowed token at load without asking anything", async () => {
    shell.registerForPushNotifications.mockResolvedValue(TOKEN);
    api.saveNative.mockResolvedValue({ id: "d1" });

    await client.refreshThisDeviceSubscription("fr");

    expect(shell.registerForPushNotifications).toHaveBeenCalledWith();
    expect(api.saveNative).toHaveBeenCalledWith(TOKEN.endpoint, "apns", TOKEN.installationId, "fr", {
      refresh: true,
      track: false,
      target: { platform: "ios", environment: "sandbox" },
    });
  });

  it("does nothing at load while the permission is not given", async () => {
    shell.registerForPushNotifications.mockResolvedValue({ permission: "default" });
    expect(await client.refreshThisDeviceSubscription("fr")).toBeNull();
    expect(api.saveNative).not.toHaveBeenCalled();
  });

  it("never offers the PWA installation inside the app", () => {
    vi.stubGlobal("window", {});
    expect(client.isStandalone()).toBe(true);
    vi.unstubAllGlobals();
    expect(client.isPushSupported()).toBe(true);
  });

  it("reads the permission from the shell", async () => {
    shell.pushPermission.mockResolvedValue({ permission: "denied" });
    expect(await client.refreshPushPermission()).toBe("denied");
  });
});
