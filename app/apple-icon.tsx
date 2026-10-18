// Apple touch icon (the home-screen icon of an installed PWA on iOS). Generated
// rather than a static file so a preview build serves the blue variant, like
// the favicon (`app/icon.tsx`) and the manifest icons (MIN-720). It is read
// at build time, with the environment baked in.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAppEnv } from "@/lib/env";
import { pwaIcons } from "@/lib/pwa-icons";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const file = await readFile(path.join(process.cwd(), "public", pwaIcons(getAppEnv()).apple));
  return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/png" } });
}
