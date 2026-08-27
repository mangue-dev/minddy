import { readFileSync } from "node:fs";
import { app } from "electron";
import {
  desktopShellFontDataUrlFromBytes,
  desktopShellFontPath,
} from "@/lib/desktop/shell-font";

let cachedFontDataUrl: string | null | undefined;

/** Reads the packaged Inter Latin subset once for shell-owned local documents. */
export function desktopShellFontDataUrl(): string | undefined {
  if (cachedFontDataUrl !== undefined) return cachedFontDataUrl ?? undefined;
  const fontPath = desktopShellFontPath({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    sourceDirectory: __dirname,
  });
  try {
    cachedFontDataUrl = desktopShellFontDataUrlFromBytes(readFileSync(fontPath));
  } catch (error) {
    cachedFontDataUrl = null;
    console.error("[shell-ui] bundled Inter font unavailable:", error);
  }
  return cachedFontDataUrl ?? undefined;
}
