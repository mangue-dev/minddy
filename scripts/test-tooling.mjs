#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Database integration suites retain their individual commands and prerequisites.
// Discover deterministic tooling tests so new suites cannot silently miss CI.
const files = ["scripts", "captures/lib"].flatMap((directory) =>
  readdirSync(join(root, directory), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".test.mjs") && !file.endsWith(".integration.test.mjs"))
    .map((file) => join(directory, file)),
).sort();

console.log(`Running ${files.length} tooling test files.`);
const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
