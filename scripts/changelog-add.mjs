#!/usr/bin/env node
/** Prepare or preview one localized release; this command never publishes it. */
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDraft, CHANGELOG_LOCALES } from "./changelog-lib.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fileIndex = args.indexOf("--file");
const file = args[fileIndex + 1];
if (fileIndex < 0 || !file || args.some((a, i) => a !== "--file" && a !== "--dry-run" && i !== fileIndex + 1)) {
  throw new Error("Usage: node scripts/changelog-add.mjs --file release.json [--dry-run]");
}
const input = JSON.parse(await readFile(path.resolve(file), "utf8"));
if (["publishedAt", "sha", "deploymentId"].some(key => key in input)) throw new Error("Drafts cannot claim production publication");
const draft = validateDraft(input);
for (const sha of draft.evidence.commits) execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: root });
const index = JSON.parse(await readFile(path.join(root, "content/changelog/index.json"), "utf8"));
if (index.some(r => r.version === draft.version)) throw new Error("This version is already published");
console.log(`Preview: v${draft.version}, ${draft.layout}, ${draft.features.length} feature tiles`);
for (const locale of CHANGELOG_LOCALES) {
  console.log(`\n${locale}: ${draft.copy[locale].title}\n${draft.copy[locale].summary}`);
  for (const [i, f] of draft.features.entries()) console.log(`  ${i + 1}. ${f.copy[locale].title} (${f.illustration.kind})\n     ${f.copy[locale].summary}\n     ${f.copy[locale].details.join("\n     ")}`);
}
if (!args.includes("--dry-run")) {
  const folder = path.join(root, "content/changelog/drafts");
  await mkdir(folder, { recursive: true });
  const destination = path.join(folder, `${draft.version}.json`);
  const temp = `${destination}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(draft, null, 2)}\n`);
  await rename(temp, destination);
  console.log(`\nPrepared ${path.relative(root, destination)}. Publication follows a verified production deployment.`);
}
