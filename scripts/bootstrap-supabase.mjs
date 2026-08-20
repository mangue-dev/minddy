#!/usr/bin/env node
/**
 * MIN-379 — reproducible bootstrap of a Supabase minddy instance.
 *
 * Two deliberately explicit modes:
 *   pnpm bootstrap:supabase
 * starts and prepares the local stack defined by supabase/config.toml.
 *   pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL"
 * prepares an already started self-hosted stack. The PostgreSQL URL must be
 * that of a role that can apply Supabase migrations.
 *
 * The script never restarts a remote stack or overwrites a value
 * already present in the environment file. Migration is the source
 * of truth of the diagram; the Storage API is that of buckets, because they do not
 * not part of a PostgreSQL schema dump.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
export const MIGRATIONS_DIR = resolve(ROOT_DIR, "supabase/migrations");
const DEFAULT_ENV_FILE = resolve(ROOT_DIR, ".env.local");
const CORE_SECRET_KEYS = [
  "AI_KEY_ENCRYPTION_SECRET",
  "FEEDBACK_SSO_ENCRYPTION_SECRET",
];
const OPTIONAL_CAPABILITIES = ["github", "gitlab", "scheduler"];
export const MINIMAL_LOCAL_EXCLUDES = [
  "studio",
  "imgproxy",
  "postgres-meta",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
  "mailpit",
];

export function fail(message) {
  throw new Error(`Supabase bootstrap failed: ${message}`);
}

export function parseArgs(argv) {
  const options = {
    local: true,
    start: true,
    minimal: false,
    appUrl: "http://localhost:3000",
    envFile: DEFAULT_ENV_FILE,
    capabilities: new Set(),
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) fail(`${arg} expects a value.`);
      return next;
    };

    if (arg === "--") {
      continue;
    } else if (arg === "--db-url") {
      options.dbUrl = value();
      options.local = false;
    } else if (arg === "--local") {
      options.local = true;
      delete options.dbUrl;
    } else if (arg === "--skip-start") {
      options.start = false;
    } else if (arg === "--minimal") {
      options.minimal = true;
    } else if (arg === "--app-url") {
      options.appUrl = value();
    } else if (arg === "--env-file") {
      options.envFile = resolve(ROOT_DIR, value());
    } else if (arg === "--enable") {
      const capability = value();
      if (!OPTIONAL_CAPABILITIES.includes(capability)) fail(`unknown optional capability: ${capability}.`);
      options.capabilities.add(capability);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`unknown option: ${arg}. See --help.`);
    }
  }

  if (!options.local && !options.dbUrl) fail("--db-url is required outside local mode.");
  if (options.local) {
    let appUrl;
    try {
      appUrl = new URL(options.appUrl);
    } catch {
      fail("--app-url must be an absolute http(s) origin.");
    }
    if (
      (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") ||
      appUrl.username ||
      appUrl.password ||
      appUrl.pathname !== "/" ||
      appUrl.search ||
      appUrl.hash
    ) {
      fail("--app-url must be an absolute http(s) origin without a path, query, or credentials.");
    }
    options.appUrl = appUrl.origin;
  }
  if (!options.envFile.startsWith(`${ROOT_DIR}/`)) {
    fail("--env-file must stay inside this clone to avoid writing an unexpected file.");
  }
  return options;
}

export function help() {
  return `Usage: pnpm bootstrap:supabase [-- --local | --db-url <postgres-url>] [options]

Options:
  --local              Prepare the local Docker stack (default).
  --minimal            Skip local services that minddy does not need.
  --app-url <origin>   Public origin of the local app (default: http://localhost:3000).
  --db-url <url>       Applies migrations to an already started remote stack.
  --skip-start         Does not run \`supabase start\` in local mode.
  --env-file <path>    Local file to complete (default: .env.local).
  --enable <feature>    Generate secrets for github, gitlab, or scheduler. Repeat as needed.
  --dry-run            Checks prerequisites without writing or applying changes.
  -h, --help           Shows this help.

Remote mode: also provide MINDDY_PUBLIC_SUPABASE_URL,
MINDDY_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in the shell. The
required application secrets are generated in .env.local. Optional integration
secrets are generated only when their feature is explicitly enabled.`;
}

export function listMigrations(directory = MIGRATIONS_DIR) {
  if (!existsSync(directory)) fail(`migration directory is missing: ${directory}`);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) fail("no SQL migrations found.");

  const seenVersions = new Set();
  for (const file of files) {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) fail(`invalid migration name: ${file} (expected: YYYYMMDDHHMMSS_name.sql).`);
    if (seenVersions.has(match[1])) fail(`duplicate migration version: ${match[1]}.`);
    seenVersions.add(match[1]);
  }

  const contents = files.map((file) => readFileSync(resolve(directory, file), "utf8")).join("\n");
  if (!/create extension if not exists\s+"?vector"?\s+with schema\s+"?extensions"?/i.test(contents)) {
    fail("the vector extension is no longer declared in the migrations.");
  }
  return files;
}

export function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    values.set(match[1], match[2]);
  }
  return values;
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function envLine(key, value) {
  // Hex, URL and JWT keys do not need quoting. The exhaust protects
  // unusual external values ​​without turning the file into a shell script.
  const rendered = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value)
    ? value
    : JSON.stringify(value);
  return `${key}=${rendered}`;
}

export function appendMissingEnv(file, values) {
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const existing = parseEnv(before);
  const additions = [];
  for (const [key, value] of Object.entries(values)) {
    if (existing.has(key)) continue;
    additions.push(envLine(key, value));
  }
  if (additions.length === 0) return [];
  const prefix = before.length === 0 ? "# Generated by pnpm bootstrap:supabase — do not commit.\n" : before.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${before}${prefix}${additions.join("\n")}\n`, { mode: 0o600 });
  return additions.map((line) => line.slice(0, line.indexOf("=")));
}

export function generatedSecrets(capabilities = new Set()) {
  const keys = [...CORE_SECRET_KEYS];
  if (capabilities.has("github") || capabilities.has("gitlab")) {
    keys.push("GIT_STATE_SECRET", "GIT_TOKEN_ENCRYPTION_SECRET");
  }
  if (capabilities.has("scheduler")) keys.push("CRON_SECRET");
  return Object.fromEntries(keys.map((key) => [key, randomBytes(32).toString("hex")]));
}

export function run(command, args, { dryRun = false, env } = {}) {
  if (dryRun) {
    console.log(`→ ${command} ${args.map((arg) => (arg.includes("postgres") ? "<database-url>" : arg)).join(" ")}`);
    return { stdout: "", stderr: "" };
  }
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  if (result.error?.code === "ENOENT") {
    fail(`command is missing: ${command}. Install it and try again.`);
  }
  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "error without output").trim();
    fail(`${command} failed (code ${result.status}): ${details}`);
  }
  return result;
}

export function readLocalStatus({ dryRun = false } = {}) {
  if (dryRun) {
    return {
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "<anon-key>",
      SERVICE_ROLE_KEY: "<service-role-key>",
      DB_URL: "<database-url>",
    };
  }
  const { stdout } = run("supabase", ["status", "--output", "env"]);
  const status = Object.fromEntries(
    stdout
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], unquoteEnvValue(match[2])])
  );
  const missing = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "DB_URL"].filter((key) => !status[key]);
  if (missing.length > 0) {
    fail(`the local stack does not provide ${missing.join(", ")}. Check \`supabase status\`.`);
  }
  return status;
}

function remoteAppValues() {
  const required = [
    "MINDDY_PUBLIC_SUPABASE_URL",
    "MINDDY_PUBLIC_SUPABASE_ANON_KEY",
    "MINDDY_PUBLIC_APP_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    fail(
      `${missing.join(", ")} is missing from the shell. These values come from the ` +
        "self-hosted Supabase stack; they cannot be derived from the PostgreSQL URL."
    );
  }
  return Object.fromEntries(required.map((key) => [key, process.env[key].trim()]));
}

async function reconcileAndVerify({ dbUrl, appValues, dryRun, local }) {
  const reconcile = resolve(SCRIPT_DIR, "reconcile-storage-buckets.mjs");
  const verify = resolve(SCRIPT_DIR, "verify-supabase-bootstrap.mjs");
  // URLs and the service key stay in the subprocess environment, never in the
  // command line (which is visible to other processes on some systems).
  const env = {
    MDY_BOOTSTRAP_SUPABASE_URL: appValues.MINDDY_PUBLIC_SUPABASE_URL,
    MDY_BOOTSTRAP_SERVICE_ROLE_KEY: appValues.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (!local) env.MDY_BOOTSTRAP_DB_URL = dbUrl;
  run(process.execPath, [reconcile, "--from-bootstrap-env"], { dryRun, env });
  run(process.execPath, [verify, "--from-bootstrap-env", ...(local ? ["--local"] : [])], { dryRun, env });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }

  const migrations = listMigrations();
  console.log(`→ ${migrations.length} migrations validated, from ${migrations[0]} to ${migrations.at(-1)}.`);
  run("supabase", ["--version"], { dryRun: options.dryRun });

  let dbUrl;
  let appValues;
  if (options.local) {
    // The CLI downloads and checks services through Docker. Checking it before
    // `supabase start` avoids the vague “Cannot connect to Docker daemon”.
    run("docker", ["info"], { dryRun: options.dryRun });
    if (options.start) {
      const startArgs = options.minimal
        ? ["start", "--exclude", MINIMAL_LOCAL_EXCLUDES.join(",")]
        : ["start"];
      run("supabase", startArgs, { dryRun: options.dryRun });
    }
    const status = readLocalStatus({ dryRun: options.dryRun });
    dbUrl = status.DB_URL;
    appValues = {
      MINDDY_PUBLIC_SUPABASE_URL: status.API_URL,
      MINDDY_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
      MINDDY_PUBLIC_APP_URL: options.appUrl,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    };
  } else {
    dbUrl = options.dbUrl;
    appValues = remoteAppValues();
  }

  const generated = { ...appValues, ...generatedSecrets(options.capabilities) };
  if (options.dryRun) {
    console.log(`→ would complete ${basename(options.envFile)} without replacing existing values.`);
  } else {
    const added = appendMissingEnv(options.envFile, generated);
    console.log(added.length === 0 ? `→ ${basename(options.envFile)} is already complete.` : `→ ${basename(options.envFile)} completed: ${added.join(", ")}.`);
  }

  const pushArgs = options.local
    ? ["db", "push", "--local", "--yes"]
    : ["db", "push", "--db-url", dbUrl, "--yes"];
  run("supabase", pushArgs, { dryRun: options.dryRun });
  await reconcileAndVerify({ dbUrl, appValues, dryRun: options.dryRun, local: options.local });
  console.log("✓ Supabase instance ready: migrations, storage, initial values, and prerequisites verified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
