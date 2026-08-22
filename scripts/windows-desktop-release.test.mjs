import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  requireWindowsStoreArtifacts,
  requireWindowsStoreIdentity,
  WINDOWS_STORE_IDENTITY,
} from "./windows-desktop-release.mjs";

test("locks packaging to the Partner Center product identity", () => {
  assert.deepEqual(WINDOWS_STORE_IDENTITY, {
    name: "mangue-dev.minddy",
    publisher: "CN=D5052B10-735B-4EF0-920F-642DFBDEB04F",
    publisherDisplayName: "mangue-dev",
  });
  assert.doesNotThrow(() =>
    requireWindowsStoreIdentity(WINDOWS_STORE_IDENTITY.name, WINDOWS_STORE_IDENTITY.publisher)
  );
  assert.throws(
    () => requireWindowsStoreIdentity("mangue-dev.minddy", "CN=wrong"),
    /Windows Store publisher/
  );
});

test("writes the literal Partner Center identity into the AppX configuration", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  assert.match(config, /^  identityName: mangue-dev\.minddy$/m);
  assert.match(config, /^  publisher: CN=D5052B10-735B-4EF0-920F-642DFBDEB04F$/m);
  assert.doesNotMatch(config, /identityName: \$\{env\./);
  assert.doesNotMatch(config, /publisher: \$\{env\./);
});

test("requires one MSIX package for each Windows architecture", () => {
  const packages = [
    "minddy-1.2.3-windows-arm64-store.msix",
    "minddy-1.2.3-windows-x64-store.msix",
  ];
  assert.deepEqual(requireWindowsStoreArtifacts(packages), packages);
  assert.throws(
    () => requireWindowsStoreArtifacts([packages[1]]),
    /arm64 MSIX package/
  );
});

test("keeps generated release output out of subsequent packages", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const buildScript = await readFile(new URL("./build-windows-store.mjs", import.meta.url), "utf8");
  assert.match(config, /^  - "!release\/\*\*"$/m);
  assert.match(buildScript, /await rm\(output, \{ recursive: true, force: true \}\);/);
});

test("Windows CI builds and validates the Store distribution", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.match(workflow, /name: Windows desktop packages/);
  assert.match(workflow, /npm --prefix desktop run dist:win/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
  assert.match(workflow, /name: Sign disposable CI packages/);
  assert.match(workflow, /Windows Kits\\10\\bin\\\*\\x64\\signtool\.exe/);
  assert.match(workflow, /Cert:\\LocalMachine\\TrustedPeople/);
  assert.doesNotMatch(workflow, /Cert:\\CurrentUser\\TrustedPeople/);
  assert.doesNotMatch(workflow, /CSC_LINK=\$env:RUNNER_TEMP\\minddy-ci\.pfx/);
  assert.match(workflow, /verify-windows-desktop\.ps1/);
});

test("Windows packaging cannot enter an electron-updater channel", async () => {
  const updater = await readFile(new URL("../desktop/src/updater.ts", import.meta.url), "utf8");
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  assert.doesNotMatch(config, /^nsis:/m);
  assert.doesNotMatch(config, /target: nsis/);
  assert.doesNotMatch(updater, /windowsStore:/);
  assert.match(config, /^appx:\n(?:  .+\n)*?  electronUpdaterAware: false$/m);
  assert.match(config, /^  publish: null$/m);
  assert.match(config, /^  publisherDisplayName: mangue-dev$/m);
});

test("Windows Store releases can run without macOS or Linux", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/desktop-release.yml", import.meta.url),
    "utf8",
  );
  const deploy = await readFile(new URL("../deploy.sh", import.meta.url), "utf8");

  assert.match(workflow, /^      target:$/m);
  assert.match(workflow, /^    if: inputs\.target == 'all'$/m);
  assert.match(workflow, /^    if: inputs\.target == 'all' \|\| inputs\.target == 'windows'$/m);
  assert.match(workflow, /name: Attest Windows desktop artifacts\n\s+if: github\.event\.repository\.visibility == 'public'/);
  assert.match(workflow, /name: Document unavailable GitHub attestation/);
  assert.match(deploy, /MODE" = "windows"/);
  assert.match(deploy, /-f target="\$DESKTOP_TARGET"/);
});
