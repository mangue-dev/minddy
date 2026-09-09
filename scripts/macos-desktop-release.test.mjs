import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  macArtifactMetadata,
  requireMacReleaseArtifacts,
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
