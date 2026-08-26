export type DesktopBackgroundNotificationTransport = "apns" | null;
export type DesktopNotificationSettings = "macos" | null;
export type DesktopNotificationBadge = "dock" | null;

/** The notification features the desktop shell can actually provide. */
export interface DesktopNotificationCapabilities {
  readonly localNativeBanners: boolean;
  readonly backgroundTransport: DesktopBackgroundNotificationTransport;
  readonly settings: DesktopNotificationSettings;
  readonly badge: DesktopNotificationBadge;
}

const UNSUPPORTED: DesktopNotificationCapabilities = Object.freeze({
  localNativeBanners: false,
  backgroundTransport: null,
  settings: null,
  badge: null,
});

/**
 * Select desktop notification support without consulting Electron globals.
 * APNs requires the signed, packaged macOS app; local banners do not.
 */
export function notificationCapabilitiesForPlatform(
  platform: NodeJS.Platform,
  packaged: boolean
): DesktopNotificationCapabilities {
  if (platform === "darwin") {
    return {
      localNativeBanners: true,
      backgroundTransport: packaged ? "apns" : null,
      settings: "macos",
      badge: "dock",
    };
  }
  if (platform === "win32" || platform === "linux") {
    return {
      localNativeBanners: true,
      backgroundTransport: null,
      settings: null,
      badge: null,
    };
  }
  return UNSUPPORTED;
}
