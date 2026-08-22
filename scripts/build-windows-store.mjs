#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { requireWindowsStoreIdentity } from "./windows-desktop-release.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const output = path.join(desktop, "release", "windows-store");

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
      else reject(new Error(`electron-builder stopped with ${signal ? `signal ${signal}` : `code ${code}`}.`));
    });
  });
}

requireWindowsStoreIdentity(
  requiredEnvironment("MINDDY_WINDOWS_STORE_IDENTITY_NAME"),
  requiredEnvironment("MINDDY_WINDOWS_STORE_PUBLISHER")
);

const builderCli = path.join(desktop, "node_modules", "electron-builder", "out", "cli", "cli.js");
await run(process.execPath, [
  builderCli,
  "--win",
  "appx",
  "--x64",
  "--arm64",
  "--publish",
  "never",
  "--config.directories.output=release/windows-store",
]);

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
