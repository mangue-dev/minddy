#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compatibilityPath = resolve(root, "deploy/self-hosted/compatibility.json");

export function parseArgs(argv) {
  let destination;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--") continue;
    if (argv[index] === "--destination") destination = argv[++index];
    else if (argv[index] === "--help" || argv[index] === "-h") return { help: true };
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  if (!destination) throw new Error("--destination is required.");
  return { destination: resolve(destination) };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertEmptyDestination(destination) {
  if (!existsSync(destination)) return;
  if (readdirSync(destination).length > 0) {
    throw new Error(`${destination} already exists and is not empty; choose a new directory.`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return result.stdout.trim();
}

export async function fetchOfficialSupabase(destination) {
  const compatibility = JSON.parse(await readFile(compatibilityPath, "utf8"));
  const packageVersion = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")).version;
  const entry = compatibility.entries.find((candidate) => candidate.minddyRelease === packageVersion);
  if (!entry) throw new Error("The current package version has no self-hosted compatibility entry.");
  const upstream = entry.supabase.completeOfficial;
  assertEmptyDestination(destination);
  await mkdir(destination, { recursive: true });

  run("git", ["init", "--quiet", destination]);
  run("git", ["-C", destination, "remote", "add", "origin", "https://github.com/supabase/supabase.git"]);
  run("git", ["-C", destination, "fetch", "--depth=1", "origin", upstream.commit]);
  run("git", ["-C", destination, "sparse-checkout", "init", "--cone"]);
  run("git", ["-C", destination, "sparse-checkout", "set", "docker"]);
  run("git", ["-C", destination, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);

  const commit = run("git", ["-C", destination, "rev-parse", "HEAD"]);
  if (commit !== upstream.commit) throw new Error(`Fetched ${commit}, expected ${upstream.commit}.`);
  const compose = await readFile(resolve(destination, "docker/docker-compose.yml"));
  const environment = await readFile(resolve(destination, "docker/.env.example"));
  if (sha256(compose) !== upstream.dockerComposeSha256) throw new Error("The upstream Docker Compose checksum does not match the compatibility matrix.");
  if (sha256(environment) !== upstream.environmentTemplateSha256) throw new Error("The upstream environment template checksum does not match the compatibility matrix.");
  return { commit, destination };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("Usage: node scripts/fetch-official-supabase.mjs --destination /srv/minddy/supabase");
    return;
  }
  const result = await fetchOfficialSupabase(options.destination);
  console.log(`Fetched official Supabase Docker files at ${result.destination} (${result.commit}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Unable to fetch official Supabase Docker files: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
