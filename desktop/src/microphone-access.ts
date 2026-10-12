import { systemPreferences } from "electron";

/** Always settle Chromium's permission request, including native TCC failures. */
export async function grantDesktopMicrophoneAccess(
  offerSettings: () => Promise<void>,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  if (platform !== "darwin") return true;
  try {
    const status = systemPreferences.getMediaAccessStatus("microphone");
    if (status === "granted") return true;
    if (status === "not-determined") {
      return await systemPreferences.askForMediaAccess("microphone");
    }
    // Denied permission must settle immediately while the user opens Settings.
    void offerSettings().catch(() => {
      console.error("[desktop] microphone_settings_failed");
    });
    return false;
  } catch {
    console.error("[desktop] microphone_permission_failed");
    return false;
  }
}
