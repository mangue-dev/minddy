import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import { parseWindowMaterialPreference } from "@/lib/desktop/window-material";

/**
 * Whether this device wants the blurred window material (MIN-810).
 *
 * A device setting, not an account one: the effect depends on the machine
 * (system, accessibility, GPU). A JSON file in `userData`, like the window
 * chrome, because the material is a constructor option needed before the
 * first window exists.
 */

const FILE_NAME = "window-material.json";

function materialFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/** The preference; a missing or unreadable file keeps the effect on. */
export function readWindowMaterialEnabled(): boolean {
  try {
    return parseWindowMaterialPreference(JSON.parse(readFileSync(materialFile(), "utf8")));
  } catch {
    return true;
  }
}

/** Keeps the preference. A failed write only loses it at the next launch. */
export function writeWindowMaterialEnabled(enabled: boolean): boolean {
  try {
    writeFileSync(materialFile(), `${JSON.stringify({ enabled }, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[window-material] write failed", error);
    return false;
  }
}
