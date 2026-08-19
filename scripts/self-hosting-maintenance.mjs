#!/usr/bin/env node
/**
 * Safety gates for self-hosted maintenance. They intentionally do not invent
 * backup locations, storage backends, or restore targets for the operator.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseEnvironment } from "./self-hosting-install.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_ENV_FILE = resolve(ROOT_DIR, "deploy/self-hosted/.env");

export function parseArgs(argv) {
  const [action, ...rest] = argv;
  if (!['update', 'backup', 'restore'].includes(action)) throw new Error("first argument must be update, backup, or restore.");
  const options = { action, envFile: DEFAULT_ENV_FILE, apply: false };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    const value = () => {
      const next = rest[++index];
      if (!next || next.startsWith("--")) throw new Error(`${arg} expects a value.`);
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--env-file") options.envFile = resolve(value());
    else if (arg === "--backup-dir") options.backupDir = resolve(value());
    else if (arg === "--db-url") options.dbUrl = value();
    else if (arg === "--from-release") options.fromRelease = value();
    else if (arg === "--to-release") options.toRelease = value();
    else if (arg === "--confirm-blank-target") options.confirmBlankTarget = true;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option: ${arg}.`);
  }
  return options;
}

export function help() {
  return `Usage:
  pnpm self-host:update -- --from-release vX.Y.Z --to-release vX.Y.Z --backup-dir <verified-backup>
  pnpm self-host:backup -- --backup-dir <new-backup-directory>
  pnpm self-host:restore -- --backup-dir <verified-backup> --confirm-blank-target

These commands are operator safety gates around docs/self-hosting-operations.md.
They do not copy configuration, select a Storage backend, or modify a target.`;
}

export function validateEnvironment(file) {
  if (!existsSync(file)) throw new Error(`environment file is missing: ${file}`);
  const values = parseEnvironment(readFileSync(file, "utf8"));
  for (const key of ["MINDDY_RELEASE", "MINDDY_PUBLIC_APP_URL", "MINDDY_PUBLIC_SUPABASE_URL"]) {
    if (!values[key] || values[key].startsWith("replace-with")) throw new Error(`${key} is incomplete in ${file}.`);
  }
  return values;
}

export function checkBackup(backupDir) {
  if (!backupDir) throw new Error("--backup-dir is required.");
  const manifest = resolve(backupDir, "SHA256SUMS");
  if (!existsSync(manifest)) throw new Error(`backup checksum manifest is missing: ${manifest}`);
  const result = spawnSync("sha256sum", ["--check", "SHA256SUMS"], { cwd: backupDir, encoding: "utf8" });
  if (result.error?.code === "ENOENT") throw new Error("sha256sum is required to verify the backup.");
  if (result.status !== 0) throw new Error(`backup checksum verification failed: ${(result.stderr || result.stdout).trim()}`);
}

export function maintenanceMessage(options, values) {
  const release = values.MINDDY_RELEASE;
  if (options.action === "update") {
    if (!options.fromRelease || !options.toRelease) throw new Error("update requires --from-release and --to-release.");
    return `Update preflight for ${options.fromRelease} → ${options.toRelease}; the protected configuration currently declares ${release}. Verify the release worktree, write outage, and migration order in docs/self-hosting-operations.md.`;
  }
  if (options.action === "backup") {
    if (!options.backupDir) throw new Error("backup requires --backup-dir.");
    return `Backup preflight for ${options.backupDir}. Create a write-consistent PostgreSQL plus raw Storage snapshot and checksum it as documented; this command never guesses your Storage backend.`;
  }
  if (!options.confirmBlankTarget) throw new Error("restore requires --confirm-blank-target after verifying the target is empty.");
  return `Restore preflight for ${options.backupDir}. Checksums pass; keep the restore proxy closed and follow the destructive restore order in docs/self-hosting-operations.md.`;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return console.log(help());
  const values = validateEnvironment(options.envFile);
  if (options.action === "update" || options.action === "restore") checkBackup(options.backupDir);
  console.log(`✓ ${maintenanceMessage(options, values)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Self-hosted maintenance preflight failed: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
