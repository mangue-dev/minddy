export type MobileInstallGuidePlatform = "android" | "ios";

export const SHOW_MOBILE_INSTALL_GUIDE_EVENT = "minddy:show-mobile-install-guide";

/** Tell the guide which manually selected mobile platform it should explain. */
export function showMobileInstallGuide(platform: MobileInstallGuidePlatform): void {
  window.dispatchEvent(
    new CustomEvent<MobileInstallGuidePlatform>(SHOW_MOBILE_INSTALL_GUIDE_EVENT, {
      detail: platform,
    }),
  );
}

export function mobileInstallGuidePlatformFromEvent(
  event: Event,
): MobileInstallGuidePlatform | null {
  const platform = (event as CustomEvent<unknown>).detail;
  return platform === "android" || platform === "ios" ? platform : null;
}
