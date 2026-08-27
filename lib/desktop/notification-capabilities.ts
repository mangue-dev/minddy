export type DesktopBackgroundNotificationTransport = "apns" | "wns" | null;
export type DesktopBackgroundNotificationSession = "linux" | null;
export type DesktopNotificationSettings = "macos" | "windows" | null;
export type DesktopNotificationBadge = "dock" | "windows" | null;

/** The notification features the desktop shell can actually provide. */
export interface DesktopNotificationCapabilities {
  readonly localNativeBanners: boolean;
  readonly backgroundTransport: DesktopBackgroundNotificationTransport;
  readonly backgroundSession: DesktopBackgroundNotificationSession;
  readonly settings: DesktopNotificationSettings;
  readonly badge: DesktopNotificationBadge;
}

const UNSUPPORTED: DesktopNotificationCapabilities = Object.freeze({
  localNativeBanners: false,
  backgroundTransport: null,
  backgroundSession: null,
  settings: null,
  badge: null,
});

/**
 * Select desktop notification support without consulting Electron globals.
 * APNs requires the signed, packaged macOS app. WNS additionally requires the
 * optional native helper to be present in the MSIX; local banners require neither.
 */
export function notificationCapabilitiesForPlatform(
  platform: NodeJS.Platform,
  packaged: boolean,
  nativeBannersAvailable = true,
  windowsWnsAvailable = false,
): DesktopNotificationCapabilities {
  if (platform === "darwin") {
    return {
      localNativeBanners: nativeBannersAvailable,
      backgroundTransport: packaged ? "apns" : null,
      backgroundSession: null,
      settings: "macos",
      badge: "dock",
    };
  }
  if (platform === "win32") {
    return {
      localNativeBanners: nativeBannersAvailable,
      backgroundTransport: packaged && windowsWnsAvailable ? "wns" : null,
      backgroundSession: null,
      settings: "windows",
      badge: packaged && windowsWnsAvailable ? "windows" : null,
    };
  }
  if (platform === "linux") {
    return {
      localNativeBanners: nativeBannersAvailable,
      backgroundTransport: null,
      backgroundSession: packaged ? "linux" : null,
      settings: null,
      badge: null,
    };
  }
  return UNSUPPORTED;
}
