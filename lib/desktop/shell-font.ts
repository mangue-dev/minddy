import path from "node:path";

const INTER_LATIN_RELATIVE_PATH = path.join("fonts", "inter-latin.woff2");

export function desktopShellFontPath({
  isPackaged,
  resourcesPath,
  sourceDirectory,
}: {
  isPackaged: boolean;
  resourcesPath: string;
  sourceDirectory: string;
}): string {
  return isPackaged
    ? path.join(resourcesPath, INTER_LATIN_RELATIVE_PATH)
    : path.resolve(sourceDirectory, "../../app", INTER_LATIN_RELATIVE_PATH);
}

export function desktopShellFontDataUrlFromBytes(bytes: Uint8Array): string {
  return `data:font/woff2;base64,${Buffer.from(bytes).toString("base64")}`;
}
