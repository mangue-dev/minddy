/** The package form can be inferred without loading Electron. */
export interface DesktopUpdatePlatform {
  platform: NodeJS.Platform;
  appImagePath?: string | null;
}

/**
 * Automatic updates are safe for the signed macOS bundle and the portable
 * AppImage. Debian and RPM builds remain directly downloadable, but their
 * updater invokes a local package manager without checking our detached GPG
 * signature, so users must install the next verified package themselves.
 */
export function supportsAutomaticDesktopUpdates({
  platform,
  appImagePath,
}: DesktopUpdatePlatform): boolean {
  return platform === "darwin" || (platform === "linux" && Boolean(appImagePath?.trim()));
}

/** The native menu must explain why a packaged Linux build does not check a feed. */
export function manualDesktopUpdateMessage(platform: NodeJS.Platform): string | null {
  if (platform !== "linux") return null;
  return "This Linux package is updated by installing the next GPG-verified release.";
}
