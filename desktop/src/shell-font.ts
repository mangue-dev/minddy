import { readFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

let cachedFontDataUrl: string | null | undefined;

/** Reads the packaged Inter Latin subset once for shell-owned local documents. */
export function desktopShellFontDataUrl(): string | undefined {
  if (cachedFontDataUrl !== undefined) return cachedFontDataUrl ?? undefined;
  const fontPath = app.isPackaged
    ? path.join(process.resourcesPath, "fonts", "inter-latin.woff2")
    : path.join(__dirname, "..", "..", "app", "fonts", "inter-latin.woff2");
  try {
    cachedFontDataUrl = `data:font/woff2;base64,${readFileSync(fontPath).toString("base64")}`;
  } catch (error) {
    cachedFontDataUrl = null;
    console.error("[shell-ui] bundled Inter font unavailable:", error);
  }
  return cachedFontDataUrl ?? undefined;
}
