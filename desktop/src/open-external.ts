import { shell } from "electron";

/** Keep missing browser or protocol handlers from rejecting native event callbacks. */
export async function openDesktopExternal(url: string): Promise<boolean> {
  try {
    await shell.openExternal(url);
    return true;
  } catch {
    // URLs can contain authentication or feedback tokens; do not log them.
    console.error("[desktop] external_open_failed");
    return false;
  }
}
