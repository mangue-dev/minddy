export type DesktopBackgroundNotificationTransport = "apns" | null;
export type DesktopBackgroundNotificationSession = "linux" | null;
export type DesktopNotificationSettings = "macos" | null;
export type DesktopNotificationBadge = "dock" | null;

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
 * APNs requires the signed, packaged macOS app; local banners do not.
 */
export function notificationCapabilitiesForPlatform(
  platform: NodeJS.Platform,
  packaged: boolean,
  nativeBannersAvailable = true
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
  if (platform === "win32" || platform === "linux") {
    return {
      localNativeBanners: nativeBannersAvailable,
      backgroundTransport: null,
      backgroundSession: platform === "linux" && packaged ? "linux" : null,
      settings: null,
      badge: null,
    };
  }
  return UNSUPPORTED;
}
