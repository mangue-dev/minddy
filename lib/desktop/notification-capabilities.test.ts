import { describe, expect, it } from "vitest";

import { notificationCapabilitiesForPlatform } from "./notification-capabilities";

describe("notificationCapabilitiesForPlatform", () => {
  it("keeps the complete packaged macOS notification contract", () => {
    expect(notificationCapabilitiesForPlatform("darwin", true)).toEqual({
      localNativeBanners: true,
      backgroundTransport: "apns",
      settings: "macos",
      badge: "dock",
    });
  });

  it("does not claim APNs for an unpackaged macOS build", () => {
    expect(notificationCapabilitiesForPlatform("darwin", false)).toEqual({
      localNativeBanners: true,
      backgroundTransport: null,
      settings: "macos",
      badge: "dock",
    });
  });

  it.each(["win32", "linux"] as const)(
    "exposes only local native banners on %s",
    (platform) => {
      expect(notificationCapabilitiesForPlatform(platform, true)).toEqual({
        localNativeBanners: true,
        backgroundTransport: null,
        settings: null,
        badge: null,
      });
    }
  );

  it("fails closed on an unknown platform", () => {
    expect(notificationCapabilitiesForPlatform("aix", true)).toEqual({
      localNativeBanners: false,
      backgroundTransport: null,
      settings: null,
      badge: null,
    });
  });
});
