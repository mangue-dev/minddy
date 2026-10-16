import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  parseRememberedWindowChrome,
  type RememberedWindowChrome,
} from "@/lib/desktop/window-frame";

/**
 * The frame the selected origin's last document asked for, kept across
 * launches on Windows and Linux so the first window is created with it.
 *
 * A JSON file in `userData`, like the channel and server choices, for the same
 * reason: it is needed before the first window exists. Reads and writes are
 * synchronous; the file is a few dozen bytes and is written only when the
 * observation changes.
 */

const FILE_NAME = "window-chrome.json";

function chromeFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/** The remembered observation, or null: missing, truncated or foreign data starts native. */
export function readWindowChrome(): RememberedWindowChrome | null {
  try {
    return parseRememberedWindowChrome(JSON.parse(readFileSync(chromeFile(), "utf8")));
  } catch {
    return null;
  }
}

/** Keeps the observation. A failed write only costs one window replacement next launch. */
export function writeWindowChrome(value: RememberedWindowChrome): boolean {
  try {
    writeFileSync(chromeFile(), `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[window-chrome] write failed", error);
    return false;
  }
}
