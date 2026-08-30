import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  requireWindowsStoreArtifacts,
  requireWindowsStoreIdentity,
  resolveWindowsWnsBuildIdentity,
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

test("uses rounded transparent icons for Windows shell surfaces", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const fingerprint = await readFile(new URL("./desktop-fingerprint.mjs", import.meta.url), "utf8");
  assert.match(config, /^  icon: build\/icon-windows\.png$/m);
  assert.match(config, /^  backgroundColor: transparent$/m);
  assert.match(fingerprint, /^  "desktop\/build\/appx",$/m);
  assert.match(fingerprint, /^  "desktop\/build\/icon-windows\.png",$/m);

  const icon = sharp(fileURLToPath(new URL("../desktop/build/icon-windows.png", import.meta.url)));
  const { width, height, hasAlpha } = await icon.metadata();
  assert.equal(width, 1024);
  assert.equal(height, 1024);
  assert.equal(hasAlpha, true);
  const iconCorner = await icon
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(iconCorner[3], 0, "Windows executable icon must have a transparent corner");
  const iconCenter = await sharp(
    fileURLToPath(new URL("../desktop/build/icon-windows.png", import.meta.url)),
  )
    .extract({ left: 512, top: 512, width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(iconCenter[3], 255, "Windows executable icon must have an opaque center");

  const appxAssets = [
    ["Square44x44Logo.png", 44, 44],
    ["Square150x150Logo.png", 150, 150],
    ["StoreLogo.png", 50, 50],
    ["Wide310x150Logo.png", 310, 150],
  ];
  for (const [fileName, expectedWidth, expectedHeight] of appxAssets) {
    const asset = sharp(
      fileURLToPath(new URL(`../desktop/build/appx/${fileName}`, import.meta.url)),
    );
    const metadata = await asset.metadata();
    assert.equal(metadata.width, expectedWidth, `${fileName} width`);
    assert.equal(metadata.height, expectedHeight, `${fileName} height`);
    assert.equal(metadata.hasAlpha, true, `${fileName} must support transparency`);

    const corner = await asset
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.equal(corner[3], 0, `${fileName} must have a transparent corner`);
    const center = await sharp(
      fileURLToPath(new URL(`../desktop/build/appx/${fileName}`, import.meta.url)),
    )
      .extract({
        left: Math.floor(expectedWidth / 2),
        top: Math.floor(expectedHeight / 2),
        width: 1,
        height: 1,
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    assert.equal(center[3], 255, `${fileName} must have an opaque center`);
  }
});

test("packages the architecture-matched WNS helper and COM activator", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const manifest = await readFile(
    new URL("../desktop/build/appxmanifest.xml.template", import.meta.url),
    "utf8",
  );
  const helperProject = await readFile(
    new URL("../desktop/native/wns-helper/wns-helper.vcxproj", import.meta.url),
    "utf8",
  );
  const buildScript = await readFile(new URL("./build-windows-store.mjs", import.meta.url), "utf8");
  const verifier = await readFile(new URL("./verify-windows-desktop.ps1", import.meta.url), "utf8");

  assert.doesNotMatch(config, /^  customManifestPath:/m);
  assert.match(config, /^    - from: build\/wns\/\$\{arch\}$/m);
  assert.match(manifest, /Category="windows\.comServer"/);
  assert.match(manifest, /Arguments="----WindowsAppRuntimePushServer:"/);
  assert.match(manifest, /Id="__MINDDY_WNS_APP_ID__"/);
  assert.match(helperProject, /Release\|x64/);
  assert.match(helperProject, /Release\|ARM64/);
  assert.match(helperProject, /Microsoft\.WindowsAppSDK/);
  assert.match(buildScript, /resolveWindowsWnsBuildIdentity/);
  assert.match(buildScript, /WNS is dormant; packaging without the helper and COM activator/);
  assert.match(buildScript, /--config\.appx\.customManifestPath=appxmanifest\.generated\.xml/);
  assert.match(verifier, /resources\/wns\/minddy-wns\.exe/);
  assert.match(verifier, /contains WNS components although WNS is not configured/);
});

test("packages the architecture-matched Microsoft Store update helper", async () => {
  const config = await readFile(new URL("../desktop/electron-builder.yml", import.meta.url), "utf8");
  const helperProject = await readFile(
    new URL("../desktop/native/store-update/store-update.vcxproj", import.meta.url),
    "utf8",
  );
  const helperSource = await readFile(
    new URL("../desktop/native/store-update/main.cpp", import.meta.url),
    "utf8",
  );
  const buildScript = await readFile(new URL("./build-windows-store.mjs", import.meta.url), "utf8");
  const verifier = await readFile(new URL("./verify-windows-desktop.ps1", import.meta.url), "utf8");

  assert.match(config, /^    - from: build\/store-update\/\$\{arch\}$/m);
  assert.match(helperProject, /Release\|x64/);
  assert.match(helperProject, /Release\|ARM64/);
  assert.match(helperProject, /Microsoft\.Windows\.CppWinRT/);
  assert.match(helperSource, /GetAppAndOptionalStorePackageUpdatesAsync/);
  assert.match(buildScript, /buildStoreUpdateHelper\(msbuild\)/);
  assert.match(verifier, /resources\/store-update\/minddy-store-update\.exe/);
});

test("keeps WNS dormant unless both release identities are configured", () => {
  assert.equal(resolveWindowsWnsBuildIdentity(undefined, ""), null);
  assert.throws(
    () => resolveWindowsWnsBuildIdentity("11111111-1111-1111-1111-111111111111", ""),
    /must either both be set or both be empty/
  );
  assert.throws(
    () => resolveWindowsWnsBuildIdentity("not-a-guid", "22222222-2222-2222-2222-222222222222"),
    /WINDOWS_WNS_APP_ID must be a GUID/
  );
  assert.deepEqual(
    resolveWindowsWnsBuildIdentity(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222"
    ),
    {
      appId: "11111111-1111-1111-1111-111111111111",
      objectId: "22222222-2222-2222-2222-222222222222",
    }
  );
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

test("Windows packaging runs only in the public desktop release", async () => {
  const ci = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const release = await readFile(
    new URL("../.github/workflows/desktop-release.yml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(ci, /runs-on: windows-/);
  assert.match(release, /runs-on: windows-2025/);
  assert.match(release, /npm --prefix desktop run dist:win:store/);
  assert.match(release, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
  assert.match(release, /name: Sign and install disposable MSIX copies/);
  assert.match(release, /Cert:\\LocalMachine\\TrustedPeople/);
  assert.match(release, /-InstallStore -StoreDirectory \$testDirectory/);
  assert.match(release, /verify-windows-desktop\.ps1/);
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
