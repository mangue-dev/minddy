import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import { normalizeDesktopServerOrigin } from "@/lib/desktop/server-origin";

const FILE_NAME = "server.json";

function serverFile(): string {
  return path.join(app.getPath("userData"), FILE_NAME);
}

/** Returns the selected self-hosted origin, or null for minddy Cloud. */
export function readDesktopServerOrigin(): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(serverFile(), "utf8"));
    if (typeof raw !== "object" || raw === null) return null;
    const origin = (raw as { origin?: unknown }).origin;
    return origin === null ? null : normalizeDesktopServerOrigin(origin);
  } catch {
    return null;
  }
}

/** Persists the server choice before the desktop window reloads. */
export function writeDesktopServerOrigin(origin: string | null): boolean {
  try {
    writeFileSync(serverFile(), `${JSON.stringify({ origin }, null, 2)}\n`, "utf8");
    return true;
  } catch (error) {
    console.error("[server] write failed", error);
    return false;
  }
}
