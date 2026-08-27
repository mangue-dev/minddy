#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  requireWindowsStoreIdentity,
  resolveWindowsWnsBuildIdentity,
} from "./windows-desktop-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const output = path.join(desktop, "release", "windows-store");
const nativeProject = path.join(desktop, "native", "wns-helper", "wns-helper.vcxproj");
const nativeOutput = path.join(desktop, "build", "wns");
const nativeIntermediate = path.join(desktop, "build", "wns-obj");
const manifestTemplate = path.join(desktop, "build", "appxmanifest.xml.template");
const generatedManifest = path.join(desktop, "build", "appxmanifest.generated.xml");

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required and must match the identity assigned by Partner Center.`);
  }
  return value;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: desktop,
      env: process.env,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} stopped with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: desktop,
      env: process.env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} stopped with code ${code}.`));
    });
  });
}

async function findMsBuild() {
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) throw new Error("ProgramFiles(x86) is unavailable.");
  const vswhere = path.join(
    programFilesX86,
    "Microsoft Visual Studio",
    "Installer",
    "vswhere.exe",
  );
  const found = await capture(vswhere, [
    "-latest",
    "-requires",
    "Microsoft.Component.MSBuild",
    "-find",
    "MSBuild\\**\\Bin\\MSBuild.exe",
  ]);
  const executable = found.split(/\r?\n/).find(Boolean);
  if (!executable) throw new Error("MSBuild was not found in Visual Studio.");
  return executable;
}

async function buildWnsHelper(msbuild, objectId) {
  await rm(nativeOutput, { recursive: true, force: true });
  await rm(nativeIntermediate, { recursive: true, force: true });
  for (const [platform, directory] of [["x64", "x64"], ["ARM64", "arm64"]]) {
    const outDir = `${path.join(nativeOutput, directory)}${path.sep}`;
    const intDir = `${path.join(nativeIntermediate, directory)}${path.sep}`;
    await run(msbuild, [
      nativeProject,
      "/restore",
      "/m",
      "/p:Configuration=Release",
      `/p:Platform=${platform}`,
      `/p:WnsObjectId=${objectId}`,
      `/p:OutDir=${outDir}`,
      `/p:IntDir=${intDir}`,
    ]);
  }
}

requireWindowsStoreIdentity(
  requiredEnvironment("MINDDY_WINDOWS_STORE_IDENTITY_NAME"),
  requiredEnvironment("MINDDY_WINDOWS_STORE_PUBLISHER")
);
const wnsIdentity = resolveWindowsWnsBuildIdentity(
  process.env.MINDDY_WINDOWS_WNS_APP_ID,
  process.env.MINDDY_WINDOWS_WNS_OBJECT_ID,
);

try {
  await rm(nativeOutput, { recursive: true, force: true });
  await Promise.all([
    mkdir(path.join(nativeOutput, "x64"), { recursive: true }),
    mkdir(path.join(nativeOutput, "arm64"), { recursive: true }),
  ]);
  if (wnsIdentity) {
    const template = await readFile(manifestTemplate, "utf8");
    await writeFile(
      generatedManifest,
      template.replace("__MINDDY_WNS_APP_ID__", wnsIdentity.appId),
    );
    await buildWnsHelper(await findMsBuild(), wnsIdentity.objectId);
  } else {
    console.log("[build-windows-store] WNS is dormant; packaging without the helper and COM activator.");
  }
  await rm(output, { recursive: true, force: true });

  const builderCli = path.join(desktop, "node_modules", "electron-builder", "out", "cli", "cli.js");
  const builderArgs = [
    builderCli,
    "--win",
    "appx",
    "--x64",
    "--arm64",
    "--publish",
    "never",
    "--config.directories.output=release/windows-store",
  ];
  if (wnsIdentity) {
    builderArgs.push("--config.appx.customManifestPath=appxmanifest.generated.xml");
  }
  await run(process.execPath, builderArgs);

  const outputEntries = await readdir(output);
  const appxPackages = outputEntries.filter((name) => name.endsWith(".appx"));
  if (appxPackages.length !== 2) {
    throw new Error(`Expected x64 and arm64 AppX payloads, found ${appxPackages.length}.`);
  }
  if (outputEntries.some((name) => /^latest.*\.ya?ml$/i.test(name))) {
    throw new Error("The Store build emitted electron-updater metadata.");
  }

  // electron-builder calls the target AppX, but its output is a modern MSIX
  // package. Use the current extension expected by Partner Center and by the
  // public release contract.
  for (const appx of appxPackages) {
    const msix = `${appx.slice(0, -".appx".length)}.msix`;
    await rm(path.join(output, msix), { force: true });
    await rename(path.join(output, appx), path.join(output, msix));
    console.log(`[build-windows-store] ${appx} → ${msix}`);
  }
} finally {
  await rm(generatedManifest, { force: true });
  await rm(nativeOutput, { recursive: true, force: true });
  await rm(nativeIntermediate, { recursive: true, force: true });
}
