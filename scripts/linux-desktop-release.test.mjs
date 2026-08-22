import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LINUX_UPDATE_MANIFESTS,
  linuxArtifactNames,
  requireLinuxArtifactArchitecture,
  requireLinuxReleaseArtifacts,
  signatureStatusMatchesFingerprint,
} from "./linux-desktop-release.mjs";

const manifest = `version: 1.2.3
files:
  - url: minddy-1.2.3-x64.AppImage
    sha512: appimage
  - url: minddy-1.2.3-x64.deb
    sha512: deb
  - url: minddy-1.2.3-x64.rpm
    sha512: rpm
  - url: minddy-1.2.3-x64.AppImage.blockmap
    sha512: blockmap
`;

test("selects only published Linux package artifacts", () => {
  assert.deepEqual(linuxArtifactNames(manifest), [
    "minddy-1.2.3-x64.AppImage",
    "minddy-1.2.3-x64.deb",
    "minddy-1.2.3-x64.rpm",
  ]);
});

test("lists the architecture-specific manifests electron-builder publishes", () => {
  assert.deepEqual(LINUX_UPDATE_MANIFESTS, [
    { arch: "x64", manifest: "latest-linux.yml", checksums: "SHA256SUMS-linux-x64" },
    { arch: "arm64", manifest: "latest-linux-arm64.yml", checksums: "SHA256SUMS-linux-arm64" },
  ]);
});

test("rejects an incomplete Linux release directory", () => {
  assert.throws(
    () => requireLinuxReleaseArtifacts(manifest, ["minddy-1.2.3-x64.AppImage"]),
    /minddy-1\.2\.3-x64\.deb/
  );
});

test("rejects unsafe names and manifests without packages", () => {
  assert.throws(
    () => linuxArtifactNames("files:\n  - url: ../minddy.AppImage\n"),
    /unsafe artifact name/
  );
  assert.throws(
    () => linuxArtifactNames("files:\n  - url: ..\\minddy.AppImage\n"),
    /unsafe artifact name/
  );
  assert.throws(() => linuxArtifactNames("version: 1.2.3\nfiles:\n"), /does not announce/);
});

test("rejects packages listed in the wrong architecture manifest", () => {
  assert.doesNotThrow(() =>
    requireLinuxArtifactArchitecture(
      ["minddy-1.2.3.AppImage", "minddy-desktop_1.2.3_amd64.deb", "minddy-1.2.3.x86_64.rpm"],
      "x64",
      "latest-linux.yml"
    )
  );
  assert.doesNotThrow(() =>
    requireLinuxArtifactArchitecture(
      ["minddy-1.2.3-arm64.AppImage", "minddy-desktop_1.2.3_arm64.deb", "minddy-1.2.3.aarch64.rpm"],
      "arm64",
      "latest-linux-arm64.yml"
    )
  );
  assert.throws(
    () => requireLinuxArtifactArchitecture(["minddy-1.2.3-arm64.AppImage"], "x64", "latest-linux.yml"),
    /ARM64 artifacts/
  );
  assert.throws(
    () => requireLinuxArtifactArchitecture(["minddy-1.2.3.AppImage"], "arm64", "latest-linux-arm64.yml"),
    /non-ARM64 artifacts/
  );
});

test("accepts a configured primary key when GPG signs through its subkey", () => {
  const primary = "0123456789ABCDEF0123456789ABCDEF01234567";
  const subkey = "89ABCDEF0123456789ABCDEF0123456789ABCDEF";
  const status = `[GNUPG:] VALIDSIG ${subkey} 2026-08-22 0 4 0 1 10 00 ${primary}\n`;

  assert.equal(signatureStatusMatchesFingerprint(status, primary), true);
  assert.equal(signatureStatusMatchesFingerprint(status, subkey), true);
  assert.equal(signatureStatusMatchesFingerprint(status, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
});

test("Linux packaging CI builds both configured architectures", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /run: npm --prefix desktop run dist:linux\s*$/m);
  assert.doesNotMatch(workflow, /dist:linux\s+--\s+--x64/);
  assert.match(workflow, /test -f desktop\/release\/latest-linux-arm64\.yml/);
});

test("native Linux packages declare Electron's direct ALSA runtime dependency", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  assert.match(config, /^deb:\n(?:  .+\n)*?    - libasound2t64 \| libasound2$/m);
  assert.match(config, /^rpm:\n(?:  .+\n)*?    - alsa-lib$/m);
});
