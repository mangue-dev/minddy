import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  darwinVersionForMacos,
  macArtifactMetadata,
  requireMacReleaseArtifacts,
  withMacMinimumSystemVersion,
} from "./macos-desktop-release.mjs";

const manifest = `version: 1.2.3
files:
  - url: minddy-1.2.3-mac.zip
    sha512: zip-digest
    size: 123
  - url: minddy-1.2.3-arm64.dmg
    sha512: dmg-digest
    size: 456
  - url: minddy-1.2.3-mac.zip.blockmap
    sha512: blockmap-digest
    size: 789
`;

test("reads macOS archive metadata from the electron-builder manifest", () => {
  assert.deepEqual(macArtifactMetadata(manifest), [
    { name: "minddy-1.2.3-mac.zip", sha512: "zip-digest", size: 123 },
    { name: "minddy-1.2.3-arm64.dmg", sha512: "dmg-digest", size: 456 },
  ]);
});

test("requires every announced macOS archive before publication", () => {
  assert.deepEqual(
    requireMacReleaseArtifacts(manifest, [
      "minddy-1.2.3-mac.zip",
      "minddy-1.2.3-arm64.dmg",
    ]),
    macArtifactMetadata(manifest),
  );
  assert.throws(
    () => requireMacReleaseArtifacts(manifest, ["minddy-1.2.3-mac.zip"]),
    /minddy-1\.2\.3-arm64\.dmg/,
  );
});

test("gates the update feed on the Darwin version of the bundle's macOS minimum", () => {
  assert.equal(darwinVersionForMacos("11.0"), "20.0.0");
  assert.equal(darwinVersionForMacos("13.0"), "22.0.0");
  assert.throws(() => darwinVersionForMacos("10.15"), /Unsupported macOS minimum/);
  assert.throws(() => darwinVersionForMacos(""), /Unsupported macOS minimum/);

  const gated = withMacMinimumSystemVersion(manifest, "13.0");
  assert.match(gated, /^minimumSystemVersion: 22\.0\.0$/m);
  assert.deepEqual(macArtifactMetadata(gated), macArtifactMetadata(manifest));
  const regated = withMacMinimumSystemVersion(gated, "14.0");
  assert.equal(regated.match(/^minimumSystemVersion:/gm).length, 1);
  assert.match(regated, /^minimumSystemVersion: 23\.0\.0$/m);
});

test("the shipped electron-updater skips a gated release below its macOS minimum", (t) => {
  // The desktop app's own updater: its feed parser and the check run before a download.
  const desktopRequire = createRequire(new URL("../desktop/package.json", import.meta.url));
  const { AppUpdater } = desktopRequire("electron-updater/out/AppUpdater.js");
  const { parseUpdateInfo } = desktopRequire("electron-updater/out/providers/Provider.js");
  const info = parseUpdateInfo(
    withMacMinimumSystemVersion(manifest, "13.0"),
    "latest-mac.yml",
    new URL("https://feed.example/desktop/latest-mac.yml")
  );
  const updater = { _logger: { info() {}, warn() {} } };
  const supportedOn = (darwin) => {
    t.mock.method(os, "release", () => darwin);
    return AppUpdater.prototype.checkIfUpdateSupported.call(updater, info);
  };
  assert.equal(supportedOn("20.6.0"), false, "macOS 11");
  assert.equal(supportedOn("21.6.0"), false, "macOS 12");
  assert.equal(supportedOn("22.1.0"), true, "macOS 13");
  assert.equal(supportedOn("25.0.0"), true, "macOS 26");
});

test("rejects unsafe and incomplete macOS manifest entries", () => {
  assert.throws(
    () => macArtifactMetadata("files:\n  - url: ../minddy.zip\n    sha512: digest\n    size: 1\n"),
    /unsafe artifact name/,
  );
  assert.throws(
    () => macArtifactMetadata("files:\n  - url: minddy.zip\n    size: 1\n"),
    /incomplete metadata/,
  );
});

test("uses a dedicated child-entitlements file and strict release verification", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const inherit = await readFile(
    new URL("../desktop/build/entitlements.mac.inherit.plist", import.meta.url),
    "utf8",
  );
  const publisher = await readFile(new URL("./publish-desktop.mjs", import.meta.url), "utf8");

  assert.match(config, /entitlementsInherit: build\/entitlements\.mac\.inherit\.plist/);
  assert.match(config, /strictVerify: true/);
  assert.doesNotMatch(inherit, /com\.apple\.developer\.aps-environment/);
  assert.match(publisher, /--verify.*--deep.*--strict/);
  assert.match(publisher, /spctl/);
});

test("keeps the installer window's assets in step with its layout", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const svg = await readFile(new URL("../desktop/build/background.svg", import.meta.url), "utf8");
  const fingerprint = await readFile(new URL("./desktop-fingerprint.mjs", import.meta.url), "utf8");
  const dmg = config.slice(config.indexOf("\ndmg:\n"), config.indexOf("\npublish:\n"));

  // The background is a HiDPI pair: 540×380 points, and a 2× page behind it.
  const background = fileURLToPath(new URL("../desktop/build/background.tiff", import.meta.url));
  const base = await sharp(background).metadata();
  const retina = await sharp(background, { page: 1 }).metadata();
  assert.deepEqual([base.pages, base.width, base.height], [2, 540, 380]);
  assert.deepEqual([retina.width, retina.height], [1080, 760]);

  // Each visible icon sits on a card of the SVG, 212×204 points, with the icon
  // 6 points above the card's center so that its label fits underneath.
  const cards = [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="212" height="204"/g)].map(
    ([, x, y]) => `${Number(x) + 106},${Number(y) + 96}`
  );
  const icons = [...dmg.matchAll(/^ {4}- x: (\d+)\n {6}y: (\d+)\n {6}type: (?:file|link)$/gm)]
    .map(([, x, y]) => `${x},${y}`)
    .filter((position) => Number(position.split(",")[1]) < 380);
  assert.deepEqual(icons, ["140,154", "400,154"]);
  assert.deepEqual(cards, icons);

  // The hidden files are copied over themselves from committed files, placed
  // below the window, and fingerprinted like every other packaging input.
  const hidden = [...dmg.matchAll(/^ {6}y: (\d+)\n {6}type: file\n {6}path: (\S+)\n {6}name: (\S+)$/gm)];
  assert.deepEqual(
    hidden.map(([, , path, name]) => [path, name]),
    [
      ["build/background.tiff", ".background.tiff"],
      ["build/volume.icns", ".VolumeIcon.icns"],
    ]
  );
  for (const [, y, path] of hidden) {
    assert.ok(Number(y) > 380, `${path} must sit below the window`);
    assert.ok(fingerprint.includes(`"desktop/${path}",`), `${path} must be fingerprinted`);
  }
  assert.match(dmg, /^ {2}background: build\/background\.tiff$/m);
  assert.match(dmg, /^ {2}icon: build\/volume\.icns$/m);
});
