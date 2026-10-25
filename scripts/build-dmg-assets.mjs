#!/usr/bin/env node
/**
 * Builds the two files of the macOS installer window (MIN-789), on a Mac with
 * Xcode 26:
 *
 * - `desktop/build/background.tiff`, rendered from `background.svg` at 1× and
 *   2× and merged into one HiDPI image by `tiffutil`;
 * - `desktop/build/volume.icns`, the icon of the mounted volume, compiled from
 *   `icon.icon` by electron-builder's own Icon Composer step, so it is the icns
 *   the build would generate.
 *
 * Both are committed because `dmg.contents` names them: dmgbuild copies each
 * content item over the file it already wrote (same bytes), which is the only
 * way electron-builder lets us position the hidden `.background.tiff` and
 * `.VolumeIcon.icns` outside the window. Run this after editing the SVG or the
 * app icon, and commit the outputs; both are packaging inputs of the desktop
 * fingerprint.
 *
 *   node scripts/build-dmg-assets.mjs
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";

const build = fileURLToPath(new URL("../desktop/build/", import.meta.url));
const requireFromDesktop = createRequire(new URL("../desktop/package.json", import.meta.url));
const { generateAssetCatalogForIcon } = requireFromDesktop(
  "app-builder-lib/out/util/macosIconComposer.js"
);

const temp = await mkdtemp(path.join(os.tmpdir(), "minddy-dmg-"));
try {
  const renders = [];
  for (const scale of [1, 2]) {
    const file = path.join(temp, `background-${scale}x.png`);
    // `density` is in DPI; the SVG is authored at 72, one unit per point.
    // tiffutil pairs the two representations by their embedded resolution.
    await sharp(path.join(build, "background.svg"), { density: 72 * scale })
      .withMetadata({ density: 72 * scale })
      .png()
      .toFile(file);
    renders.push(file);
  }
  await promisify(execFile)("tiffutil", [
    "-cathidpicheck",
    ...renders,
    "-out",
    path.join(build, "background.tiff"),
  ]);
  console.log("desktop/build/background.tiff");

  const { icnsFile } = await generateAssetCatalogForIcon(path.join(build, "icon.icon"));
  await writeFile(path.join(build, "volume.icns"), icnsFile);
  console.log("desktop/build/volume.icns");
} finally {
  await rm(temp, { recursive: true, force: true });
}
