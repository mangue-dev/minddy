#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertVersion, updateChangelog } from "./release-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = assertVersion(process.argv[2] ?? "");
const today = new Date().toISOString().slice(0, 10);

if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error("the working tree must be clean before preparing a release");
}
if (execFileSync("git", ["tag", "--list", `v${version}`], { cwd: root, encoding: "utf8" }).trim()) {
  throw new Error(`tag v${version} already exists`);
}

const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = await readFile(changelogPath, "utf8");
const nextChangelog = updateChangelog(changelog, version, today);

const manifests = ["package.json", "package-lock.json", "desktop/package.json", "desktop/package-lock.json"];
const updates = await Promise.all(manifests.map(async (relative) => {
  const file = path.join(root, relative);
  const json = JSON.parse(await readFile(file, "utf8"));
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  return [file, `${JSON.stringify(json, null, 2)}\n`];
}));
await Promise.all([
  ...updates.map(([file, content]) => writeFile(file, content)),
  writeFile(changelogPath, nextChangelog),
]);

console.log(`Release v${version} prepared.`);
console.log("Review CHANGELOG.md, commit these files, then wait for green CI before publishing.");
