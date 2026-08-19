#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployDirectory = resolve(root, "deploy/self-hosted");
const compatibilityPath = join(deployDirectory, "compatibility.json");
const upstreamBaseUrl = "https://raw.githubusercontent.com/supabase/supabase";

export const REQUIRED_PROFILE_FILES = [
  "deploy/self-hosted/compose.managed.yml",
  "deploy/self-hosted/compose.full.yml",
  "deploy/self-hosted/Caddyfile",
  "deploy/self-hosted/Caddyfile.full",
  "deploy/self-hosted/scheduler.mjs",
  "deploy/self-hosted/.env.example",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return result.stdout;
}

function parseEnvironment(text) {
  return Object.fromEntries(
    text.split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

export function assertReleaseReferences(entry, environment) {
  if (environment.MINDDY_RELEASE !== entry.minddyRelease) {
    throw new Error(`MINDDY_RELEASE must be ${entry.minddyRelease}.`);
  }
  for (const [name, expected] of Object.entries(entry.referenceCompose)) {
    const variable = name === "minddyImage" ? "MINDDY_IMAGE" : name === "caddyImage" ? "CADDY_IMAGE" : "SCHEDULER_IMAGE";
    if (environment[variable] !== expected) throw new Error(`${variable} must be pinned to ${expected}.`);
  }
  if (!entry.application.architectures.includes("linux/amd64") || !entry.application.architectures.includes("linux/arm64")) {
    throw new Error("The compatibility row must support linux/amd64 and linux/arm64.");
  }
}

export function createDisposableEnvironment(entry, directory, upstream = {}) {
  return {
    ...upstream,
    MINDDY_RELEASE: entry.minddyRelease,
    MINDDY_IMAGE: entry.referenceCompose.minddyImage,
    CADDY_IMAGE: entry.referenceCompose.caddyImage,
    SCHEDULER_IMAGE: entry.referenceCompose.schedulerImage,
    MINDDY_DEPLOY_DIR: deployDirectory,
    MINDDY_ENV_FILE: join(directory, "deployment.env"),
    MINDDY_HOST: "http://localhost",
    SUPABASE_HOST: "http://localhost",
    CADDY_EMAIL: "operator@example.test",
    MINDDY_HTTP_BIND_ADDRESS: "127.0.0.1",
    MINDDY_EDITION: "self-hosted",
    MINDDY_PUBLIC_APP_URL: "http://localhost",
    MINDDY_PUBLIC_SUPABASE_URL: "http://localhost",
    MINDDY_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    MINDDY_MANAGED_AI: "0",
    MINDDY_MANAGED_BILLING: "0",
    AGENT_EXECUTION_BACKEND: "local",
    CRON_SECRET: "0123456789abcdef0123456789abcdef",
    MINDDY_SCHEDULER_URL: "http://minddy:3000",
  };
}

function serializeEnvironment(environment) {
  return `${Object.entries(environment).map(([name, value]) => `${name}=${value}`).join("\n")}\n`;
}

async function fetchPinnedFile(commit, path, checksum) {
  const response = await fetch(`${upstreamBaseUrl}/${commit}/${path}`);
  if (!response.ok) throw new Error(`Unable to download the pinned upstream ${path}: ${response.status}.`);
  const body = await response.text();
  if (sha256(body) !== checksum) throw new Error(`The pinned upstream ${path} checksum does not match compatibility.json.`);
  return body;
}

function assertImagePlatforms(image) {
  const output = run("docker", ["buildx", "imagetools", "inspect", image]);
  if (!output.includes("linux/amd64") || !output.includes("linux/arm64")) {
    throw new Error(`${image} does not publish both linux/amd64 and linux/arm64 manifests.`);
  }
}

export async function validate({ checkPlatforms = true } = {}) {
  const compatibility = JSON.parse(await readFile(compatibilityPath, "utf8"));
  const packageVersion = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
  const entry = compatibility.entries.find((candidate) => candidate.minddyRelease === packageVersion);
  if (!entry) throw new Error(`No compatibility row exists for minddy ${packageVersion}.`);
  const guidedEnvironment = parseEnvironment(await readFile(join(deployDirectory, ".env.example"), "utf8"));
  assertReleaseReferences(entry, guidedEnvironment);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "minddy-compose-"));
  try {
    const managedEnvironment = createDisposableEnvironment(entry, temporaryDirectory);
    await writeFile(join(temporaryDirectory, "deployment.env"), serializeEnvironment(managedEnvironment));
    run("docker", ["compose", "--env-file", join(temporaryDirectory, "deployment.env"), "-f", join(deployDirectory, "compose.managed.yml"), "config", "--quiet"]);

    const upstream = entry.supabase.completeOfficial;
    const [upstreamCompose, upstreamEnvironment] = await Promise.all([
      fetchPinnedFile(upstream.commit, "docker/docker-compose.yml", upstream.dockerComposeSha256),
      fetchPinnedFile(upstream.commit, "docker/.env.example", upstream.environmentTemplateSha256),
    ]);
    const upstreamDirectory = join(temporaryDirectory, "supabase/docker");
    await mkdir(upstreamDirectory, { recursive: true });
    await writeFile(join(upstreamDirectory, "docker-compose.yml"), upstreamCompose);
    const fullEnvironment = createDisposableEnvironment(entry, temporaryDirectory, parseEnvironment(upstreamEnvironment));
    await writeFile(join(temporaryDirectory, "deployment.env"), serializeEnvironment(fullEnvironment));
    run("docker", ["compose", "--env-file", join(temporaryDirectory, "deployment.env"), "-f", join(upstreamDirectory, "docker-compose.yml"), "-f", join(deployDirectory, "compose.full.yml"), "config", "--quiet"]);

    if (checkPlatforms) {
      assertImagePlatforms(entry.referenceCompose.caddyImage);
      assertImagePlatforms(entry.referenceCompose.schedulerImage);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.some((value) => value === "--help" || value === "-h")) {
    console.log("Usage: node scripts/validate-self-hosted-compose.mjs [--skip-platform-check]");
    return;
  }
  const checkPlatforms = !argv.includes("--skip-platform-check");
  if (argv.some((value) => value !== "--skip-platform-check")) throw new Error("Unknown option. See --help.");
  await validate({ checkPlatforms });
  console.log("Self-hosted Compose profiles are valid for the pinned release inputs.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Self-hosted Compose validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
