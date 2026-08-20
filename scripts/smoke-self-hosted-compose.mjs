#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

export function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new Error(`${arg} expects a value.`);
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--profile") options.profile = value();
    else if (arg === "--env-file") options.environmentFile = resolve(value());
    else if (arg === "--supabase-compose") options.supabaseCompose = resolve(value());
    else if (arg === "--public-url") options.publicUrl = value();
    else if (arg === "--persistence-url") options.persistenceUrl = value();
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) return options;
  if (!new Set(["managed", "full"]).has(options.profile)) throw new Error("--profile must be managed or full.");
  if (!options.environmentFile || !existsSync(options.environmentFile)) throw new Error("--env-file must identify an existing protected environment file.");
  if (options.profile === "full" && !options.supabaseCompose) throw new Error("--supabase-compose is required for the full profile.");
  if (!options.publicUrl) throw new Error("--public-url is required to test the Caddy endpoint.");
  for (const name of ["publicUrl", "persistenceUrl"]) {
    if (options[name]) new URL(options[name]);
  }
  return options;
}

export function composeArgs(options, additional = []) {
  const profile = resolve(root, `deploy/self-hosted/compose.${options.profile}.yml`);
  return [
    "compose",
    "--env-file", options.environmentFile,
    ...(options.supabaseCompose ? ["-f", options.supabaseCompose] : []),
    "-f", profile,
    ...additional,
  ];
}

function runDocker(args) {
  const result = spawnSync("docker", args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) throw new Error("Docker Compose smoke test command failed.");
}

async function fingerprint(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
}

async function assertCaddyEndpoint(publicUrl) {
  const healthUrl = new URL("/api/health", publicUrl);
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${healthUrl} returned ${response.status}.`);
  if (new URL(publicUrl).protocol !== "https:") return;
  const httpUrl = new URL(publicUrl);
  httpUrl.protocol = "http:";
  const redirect = await fetch(httpUrl, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (![301, 302, 307, 308].includes(redirect.status) || !redirect.headers.get("location")?.startsWith("https://")) {
    throw new Error(`Expected ${httpUrl} to redirect to HTTPS.`);
  }
}

export async function smoke(options) {
  runDocker(composeArgs(options, ["up", "-d", "--wait"]));
  await assertCaddyEndpoint(options.publicUrl);
  const before = options.persistenceUrl ? await fingerprint(options.persistenceUrl) : null;
  runDocker(composeArgs(options, ["restart", "minddy", "caddy"]));
  runDocker(composeArgs(options, ["up", "-d", "--wait"]));
  await assertCaddyEndpoint(options.publicUrl);
  if (options.persistenceUrl && before !== await fingerprint(options.persistenceUrl)) {
    throw new Error("The persistence URL changed after the application and proxy restart.");
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log("Usage: node scripts/smoke-self-hosted-compose.mjs --profile managed|full --env-file PATH --public-url URL [--supabase-compose PATH] [--persistence-url URL]");
    return;
  }
  await smoke(options);
  console.log("Self-hosted Compose smoke test completed. Inspect scheduler logs after its next scheduled minute.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Self-hosted Compose smoke test failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
