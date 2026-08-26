import { describe, expect, it } from "vitest";

import { notificationCapabilitiesForPlatform } from "./notification-capabilities";

describe("notificationCapabilitiesForPlatform", () => {
  it("keeps the complete packaged macOS notification contract", () => {
    expect(notificationCapabilitiesForPlatform("darwin", true)).toEqual({
      localNativeBanners: true,
      backgroundTransport: "apns",
      backgroundSession: null,
      settings: "macos",
      badge: "dock",
    });
  });

  it("does not claim APNs for an unpackaged macOS build", () => {
    expect(notificationCapabilitiesForPlatform("darwin", false)).toEqual({
      localNativeBanners: true,
      backgroundTransport: null,
      backgroundSession: null,
      settings: "macos",
      badge: "dock",
    });
  });

  it("exposes resident background sessions only in packaged Linux builds", () => {
    expect(notificationCapabilitiesForPlatform("linux", true)).toEqual({
      localNativeBanners: true,
      backgroundTransport: null,
      backgroundSession: "linux",
      settings: null,
      badge: null,
    });
    expect(notificationCapabilitiesForPlatform("linux", false).backgroundSession)
      .toBeNull();
    expect(notificationCapabilitiesForPlatform("win32", true).backgroundSession)
      .toBeNull();
  });

  it("reports a missing native notification server", () => {
    expect(notificationCapabilitiesForPlatform("linux", true, false)).toMatchObject({
      localNativeBanners: false,
      backgroundSession: "linux",
    });
  });

  it("fails closed on an unknown platform", () => {
    expect(notificationCapabilitiesForPlatform("aix", true)).toEqual({
      localNativeBanners: false,
      backgroundTransport: null,
      backgroundSession: null,
      settings: null,
      badge: null,
    });
  });
});
