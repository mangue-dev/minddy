#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertVersion, sha256 } from "./release-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] ?? path.join(root, ".release"));
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const desktopPkg = JSON.parse(await readFile(path.join(root, "desktop/package.json"), "utf8"));
const version = assertVersion(process.env.RELEASE_VERSION ?? pkg.version);
const tag = `v${version}`;

if (pkg.version !== version || desktopPkg.version !== version) {
  throw new Error(`package.json (${pkg.version}), desktop/package.json (${desktopPkg.version}), and release (${version}) must match`);
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: options.encoding ?? "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const commit = git(["rev-parse", "HEAD"]).trim();
const commitDate = git(["show", "-s", "--format=%cI", "HEAD"]).trim();
const tags = git(["tag", "--merged", "HEAD", "--list", "v[0-9]*", "--sort=-version:refname"])
  .trim().split("\n").filter((candidate) => candidate && candidate !== tag);
const previousTag = tags[0] ?? null;
const migrationArgs = previousTag
  ? ["diff", "--diff-filter=AMR", "--name-only", `${previousTag}..HEAD`, "--", "supabase/migrations"]
  : ["ls-tree", "-r", "--name-only", "HEAD", "supabase/migrations"];
const migrations = git(migrationArgs)
  .trim().split("\n").filter((file) => file.endsWith(".sql"));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const sourceName = `minddy-${tag}-source.tar.gz`;
const migrationsName = `minddy-${tag}-migrations.tar.gz`;
const sourceTar = git(["archive", "--format=tar", `--prefix=minddy-${tag}/`, "HEAD"], { encoding: "buffer" });
const migrationsTar = git([
  "archive", "--format=tar", `--prefix=minddy-${tag}-migrations/`, "HEAD",
  "supabase/migrations", "scripts/bootstrap-supabase.mjs", "scripts/verify-supabase-bootstrap.mjs",
  "docs/self-hosting.md", "docs/self-hosting-operations.md",
], { encoding: "buffer" });

function gzip(buffer) {
  return execFileSync("gzip", ["-9", "-n", "-c"], { input: buffer, encoding: "buffer", maxBuffer: 128 * 1024 * 1024 });
}

await writeFile(path.join(output, sourceName), gzip(sourceTar));
await writeFile(path.join(output, migrationsName), gzip(migrationsTar));

const migrationLines = migrations.length
  ? migrations.map((file) => `- \`${file}\``).join("\n")
  : "- No new SQL migrations since the previous release.";
const update = `# Update to minddy ${tag}\n\n` +
  `From: ${previousTag ?? "initial installation"}\n\n` +
  `## Included migrations\n\n${migrationLines}\n\n` +
  "Create a coordinated Postgres + Storage backup before any migration. " +
  "Follow `docs/self-hosting-operations.md`, apply migrations before starting the new code, " +
  "then run the runbook smoke tests. Migrations are forward-only: after an incompatible migration, " +
  "rollback requires restoring the complete backup.\n";
await writeFile(path.join(output, "UPDATE.md"), update);
await writeFile(
  path.join(output, "RELEASE_NOTES.md"),
  `# minddy ${tag}\n\nProduct release notes: https://minddy.app/changelog\n`,
);

const archives = {};
for (const name of [sourceName, migrationsName]) archives[name] = await sha256(path.join(output, name));
const manifest = {
  schemaVersion: 1,
  release: { version, tag, commit, commitDate, previousTag },
  scopes: { core: tag, cloud: null, marketing: null, desktop: "optional" },
  migrations,
  artifacts: archives,
  rollback: "backup-restore-required-after-incompatible-migrations",
};
await writeFile(path.join(output, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const checksumFiles = [sourceName, migrationsName, "release-manifest.json", "RELEASE_NOTES.md", "UPDATE.md"];
const checksums = [];
for (const name of checksumFiles) checksums.push(`${await sha256(path.join(output, name))}  ${name}`);
await writeFile(path.join(output, "SHA256SUMS"), `${checksums.join("\n")}\n`);

console.log(`Artifacts ${tag} created in ${output}`);
console.log(`Commit: ${commit}`);
console.log(`Migrations since ${previousTag ?? "the beginning"}: ${migrations.length}`);
