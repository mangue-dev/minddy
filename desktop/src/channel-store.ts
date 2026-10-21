import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  DESKTOP_STABLE_CHANNEL,
  storedChannelNeedsReset,
} from "@/lib/desktop/channel";

/**
 * Brings installations back from the retired preview channel (MIN-765).
 *
 * Versions before MIN-765 recorded the chosen channel in
 * `userData/channel.json`. An installation that had switched to preview would
 * otherwise keep a file that no longer means anything, so the shell rewrites it
 * to stable once, at startup, before the window loads. The window itself never
 * reads the file again: it always loads the stable origin.
 *
 * ⚠ This folder CHANGES in development (`minddy-dev`, cf. `app.setName`): a dev
 * session never touches the file of the installed app.
 *
 * Synchronous on purpose: it runs before `createWindow`, and the file is forty
 * bytes. Any failure is silent apart from a log line — the window opens on
 * production either way.
 */

const FILE_NAME = "channel.json";

/** Returns `true` when a recorded preview channel was rewritten to stable. */
export function resetRetiredDesktopChannel(): boolean {
  const file = path.join(app.getPath("userData"), FILE_NAME);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // Missing (the normal case) or unreadable: nothing to migrate.
    return false;
  }
  if (!storedChannelNeedsReset(raw)) return false;
  try {
    writeFileSync(
      file,
      `${JSON.stringify({ channel: DESKTOP_STABLE_CHANNEL }, null, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    console.error("[channel] reset failed", error);
    return false;
  }
}
