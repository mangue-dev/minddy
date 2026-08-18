import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  DESKTOP_DEFAULT_CHANNEL,
  parseDesktopChannel,
  type DesktopChannel,
} from "@/lib/desktop/channel";

/**
 * The chosen channel, retained from one launch to another (MIN-352).
 *
 * **A JSON file, and not the cookies nor the `localStorage` of the page**:
 * the channel IS the origin, so you have to know it before loading whatever
 * whatever — a setting stored in the page that serves it would never read
 * early enough to decide which page to serve. It therefore lives in `userData`, next to
 * of the session and the caches, under the app name set by `main.ts`.
 *
 * ⚠ This folder CHANGES in development (`minddy-dev`, cf. `app.setName`): a dev session cannot switch the channel of the installed app, and that's very good.
 *
 * Reading and writing **synchronous**, and this is deliberate: reading must be
 * finished before `createWindow`, and writing before the reload that follows it.
 * The file is forty bytes.
 */

const FILE_NAME = "channel.json";

function channelFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/**
 * The channel on disk, or the stable.
 *
 * **Any failure falls on the stable, silently**: file missing (first
 * opening, the normal case), JSON truncated by a sudden stop, folder in
 * read only. None of these cases justify preventing the app from opening, and
 * fallback always goes to production.
 */
export function readDesktopChannel(): DesktopChannel {
  try {
    const raw: unknown = JSON.parse(readFileSync(channelFile(), "utf8"));
    if (typeof raw !== "object" || raw === null) return DESKTOP_DEFAULT_CHANNEL;
    return parseDesktopChannel((raw as { channel?: unknown }).channel);
  } catch {
    return DESKTOP_DEFAULT_CHANNEL;
  }
}

/**
 * Keeps the channel. Returns `false` if the write failed — the caller toggles
 * still the window, but the choice will not survive the next launch, and
 * is something we want to see in the logs rather than discovering on
 * reboot.
 */
export function writeDesktopChannel(channel: DesktopChannel): boolean {
  try {
    writeFileSync(channelFile(), `${JSON.stringify({ channel }, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[channel] write failed", error);
    return false;
  }
}
