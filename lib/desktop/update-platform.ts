/** The package form can be inferred without loading Electron. */
export interface DesktopUpdatePlatform {
  platform: NodeJS.Platform;
  appImagePath?: string | null;
}

/**
 * Automatic updates are safe for the signed macOS bundle and the portable
 * AppImage. Microsoft Store owns every Windows update; Debian and RPM builds
 * remain directly downloadable, but their updater invokes a local package
 * manager without checking our detached GPG signature, so users must install
 * the next verified package themselves.
 */
export function supportsAutomaticDesktopUpdates({
  platform,
  appImagePath,
}: DesktopUpdatePlatform): boolean {
  return platform === "darwin" || (platform === "linux" && Boolean(appImagePath?.trim()));
}

/** The native menu explains which external channel owns an app's updates. */
export function manualDesktopUpdateMessage(platform: NodeJS.Platform): string | null {
  if (platform === "win32") {
    return "This installation is updated automatically by Microsoft Store.";
  }
  if (platform !== "linux") return null;
  return "This Linux package is updated by installing the next GPG-verified release.";
}
