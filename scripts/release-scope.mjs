#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const MARKETING_PATHS = [
  /^app\/\(marketing\)\//,
  /^components\/marketing\//,
  /^public\/(?:captures|marketing)\//,
  /^app\/(?:sitemap\.ts|robots\.txt|llms(?:-full)?\.txt)/,
];
const RELEASE_METADATA_PATHS = new Set(["desktop/released.json"]);

export function classifyReleaseFiles(coreFiles, webFiles, desktopChanged) {
  const meaningfulCoreFiles = coreFiles.filter((file) => !RELEASE_METADATA_PATHS.has(file));
  const meaningfulWebFiles = webFiles.filter((file) => !RELEASE_METADATA_PATHS.has(file));
  const marketingFiles = meaningfulWebFiles.filter((file) => MARKETING_PATHS.some((pattern) => pattern.test(file)));
  const nonMarketingCoreFiles = meaningfulCoreFiles.filter(
    (file) => !MARKETING_PATHS.some((pattern) => pattern.test(file)),
  );
  return {
    core: nonMarketingCoreFiles.length > 0,
    web: meaningfulWebFiles.length > 0,
    marketing: marketingFiles.length > 0,
    desktop: desktopChanged,
    coreFiles: meaningfulCoreFiles,
    webFiles: meaningfulWebFiles,
    marketingFiles,
  };
}

export function selectReleaseScopes(mode, detected, custom = {}) {
  let selected;
  if (mode === "auto") {
    selected = { core: detected.core, web: detected.web, desktop: detected.desktop };
  } else if (mode === "all") {
    selected = { core: true, web: true, desktop: true };
  } else if (mode === "custom") {
    selected = { core: Boolean(custom.core), web: Boolean(custom.web), desktop: Boolean(custom.desktop) };
  } else {
    throw new Error(`unknown deployment mode: ${mode}`);
  }
  // A public tag must target the production SHA. Publishing the heart implies
  // therefore the Cloud promotion of the commit, even if no web file has changed.
  if (selected.core) selected.web = true;
  return selected;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function changedFiles(range) {
  if (!range) return [];
  return git(["diff", "--name-only", range, "--"])
    .split("\n")
    .filter(Boolean);
}

function detect() {
  const lastTag = git(["tag", "--merged", "HEAD", "--list", "v[0-9]*", "--sort=-version:refname"])
    .split("\n")
    .find(Boolean) ?? null;
  const productionRef = git(["rev-parse", "--verify", "origin/production"]);
  const coreFiles = lastTag
    ? changedFiles(`${lastTag}..HEAD`)
    : git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  const webFiles = changedFiles(`${productionRef}..HEAD`);

  let desktopChanged = false;
  try {
    const released = JSON.parse(readFileSync(path.join(root, "desktop/released.json"), "utf8"));
    const current = execFileSync("node", ["scripts/desktop-fingerprint.mjs"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    desktopChanged = current !== released.fingerprint;
  } catch {
    desktopChanged = true;
  }

  return { lastTag, ...classifyReleaseFiles(coreFiles, webFiles, desktopChanged) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(detect())}\n`);
}
