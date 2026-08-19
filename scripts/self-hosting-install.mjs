#!/usr/bin/env node
/**
 * Guided, non-destructive installer for the reference self-hosted profiles.
 *
 * The generated environment file is deliberately readable and remains owned by
 * the operator. This script refuses to replace it; rerunning it resumes only
 * the phase commands that are safe to repeat.
 */
import { createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
export const DEFAULT_DEPLOY_DIR = resolve(ROOT_DIR, "deploy/self-hosted");
const DEFAULT_ENV_FILE = resolve(DEFAULT_DEPLOY_DIR, ".env");
const OPTIONAL_CAPABILITIES = ["scheduler"];

export function fail(message) {
  throw new Error(`Self-hosted installation failed: ${message}`);
}

export function parseArgs(argv) {
  const options = {
    deployDir: DEFAULT_DEPLOY_DIR,
    envFile: DEFAULT_ENV_FILE,
    capabilities: new Set(),
    start: true,
    bootstrap: true,
    interactive: Boolean(process.stdin.isTTY),
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) fail(`${arg} expects a value.`);
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--mode") options.mode = value();
    else if (arg === "--domain") options.domain = value();
    else if (arg === "--admin-email") options.adminEmail = value();
    else if (arg === "--caddy-email") options.caddyEmail = value();
    else if (arg === "--supabase-url") options.supabaseUrl = value();
    else if (arg === "--supabase-host") options.supabaseHost = value();
    else if (arg === "--anon-key") options.anonKey = value();
    else if (arg === "--service-role-key") options.serviceRoleKey = value();
    else if (arg === "--db-url") options.dbUrl = value();
    else if (arg === "--image") options.image = normalizeImageReference(value());
    else if (arg === "--supabase-dir") options.supabaseDir = resolve(value());
    else if (arg === "--deploy-dir") options.deployDir = resolve(value());
    else if (arg === "--env-file") options.envFile = resolve(value());
    else if (arg === "--enable") {
      const capability = value();
      if (!OPTIONAL_CAPABILITIES.includes(capability)) fail(`unknown optional capability: ${capability}.`);
      options.capabilities.add(capability);
    } else if (arg === "--non-interactive") options.interactive = false;
    else if (arg === "--skip-start") options.start = false;
    else if (arg === "--skip-bootstrap") options.bootstrap = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else fail(`unknown option: ${arg}. See --help.`);
  }
  if (options.mode && !["managed", "full"].includes(options.mode)) fail("--mode must be managed or full.");
  return options;
}

export function help() {
  return `Usage: pnpm self-host:install -- [options]

The installer explains each step and will never replace an existing environment file.

Options:
  --mode managed|full       Managed Supabase or the complete official stack.
  --domain <hostname>       Public minddy hostname (without a URL scheme).
  --admin-email <email>     First instance administrator email.
  --caddy-email <email>     Certificate notification email (defaults to admin).
  --supabase-url <https-url> --anon-key <key> --service-role-key <key>
                              Existing Supabase credentials for managed mode.
  --supabase-dir <path>     Pinned upstream Supabase checkout for full mode.
  --supabase-host <hostname> Public API hostname for full mode.
  --db-url <postgres-url>   Migration connection used only by bootstrap.
  --image <oci-reference>   Verified immutable minddy OCI digest to deploy.
  --enable scheduler         Start the opt-in scheduler after bootstrap.
  --env-file <path>         Environment file to create (default: deploy/self-hosted/.env).
  --deploy-dir <path>       Versioned self-hosted asset directory.
  --skip-start              Create configuration without starting containers.
  --skip-bootstrap           Start containers without applying migrations/buckets.
  --non-interactive         Require every required option on the command line.
  --dry-run                 Show actions without writing or starting anything.
  -h, --help                Show this help.

All optional integrations are disabled. The operator remains responsible for DNS,
firewall ports 80/443, a backup policy, and the selected Supabase service.`;
}

export function normalizeImageReference(value) {
  const reference = value.trim();
  if (!/^ghcr\.io\/mangue-dev\/minddy@sha256:[a-f0-9]{64}$/.test(reference)) {
    fail("--image must be the verified immutable minddy OCI digest reference ghcr.io/mangue-dev/minddy@sha256:<64 lowercase hex characters> from the release assets.");
  }
  return reference;
}

export function normalizeHostname(value) {
  const hostname = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!/^(?:localhost|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/.test(hostname)) {
    fail(`invalid hostname: ${value}. Use a DNS hostname without a URL scheme.`);
  }
  return hostname;
}

export function assertEmail(value, label) {
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`${label} must be an email address.`);
  return email;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function createSupabaseJwt(secret, role) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ role, iss: "supabase", iat: Math.floor(Date.now() / 1000), exp: 4102444800 }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function generatedValues() {
  const secret = () => randomBytes(32).toString("hex");
  const jwtSecret = secret();
  return {
    CRON_SECRET: secret(),
    POSTGRES_PASSWORD: secret(),
    JWT_SECRET: jwtSecret,
    ANON_KEY: createSupabaseJwt(jwtSecret, "anon"),
    SERVICE_ROLE_KEY: createSupabaseJwt(jwtSecret, "service_role"),
    SECRET_KEY_BASE: secret(),
    VAULT_ENC_KEY: randomBytes(16).toString("hex"),
    PG_META_CRYPTO_KEY: secret(),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: secret(),
    LOGFLARE_PRIVATE_ACCESS_TOKEN: secret(),
    S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
    S3_PROTOCOL_ACCESS_KEY_SECRET: secret(),
  };
}

function envValue(value) {
  return /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(value) ? value : JSON.stringify(value);
}

export function renderEnvironment(template, values) {
  return template.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || values[match[1]] === undefined) return line;
    return `${match[1]}=${envValue(values[match[1]])}`;
  }).join("\n").replace(/\n*$/, "\n");
}

export function parseEnvironment(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[2];
    values[match[1]] = value.startsWith('"') && value.endsWith('"') ? JSON.parse(value) : value;
  }
  return values;
}

export function checkpointPath(envFile) {
  return `${envFile}.install-state.json`;
}

export function recordCheckpoint(envFile, phase, { dryRun = false } = {}) {
  const file = checkpointPath(envFile);
  let state = { phases: {} };
  if (existsSync(file)) {
    try {
      state = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      fail(`checkpoint file is unreadable: ${file}. It was not changed.`);
    }
  }
  if (state.phases?.[phase]) {
    console.log(`→ checkpoint already recorded: ${phase}.`);
    return;
  }
  console.log(`→ checkpoint: ${phase}.`);
  if (dryRun) return;
  state.phases ??= {};
  state.phases[phase] = new Date().toISOString();
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(file, 0o600);
}

export function createEnvironmentFile(file, contents) {
  writeFileSync(file, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  chmodSync(file, 0o600);
}

function assertCompleteEnvironment(values) {
  const required = [
    "MINDDY_PUBLIC_APP_URL",
    "MINDDY_PUBLIC_SUPABASE_URL",
    "MINDDY_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const placeholders = required.filter((key) => !values[key] || /^(?:replace-with|tickets\.example\.com|supabase\.example\.com)/.test(values[key]));
  if (placeholders.length > 0) fail(`${placeholders.join(", ")} is incomplete in the existing environment file. It was not changed.`);
}

export function environmentValues(options, generated = generatedValues()) {
  const domain = normalizeHostname(options.domain);
  const adminEmail = assertEmail(options.adminEmail, "--admin-email");
  const caddyEmail = assertEmail(options.caddyEmail || adminEmail, "--caddy-email");
  const full = options.mode === "full";
  const supabaseHost = full ? normalizeHostname(options.supabaseHost || `supabase.${domain}`) : undefined;
  const appUrl = domain === "localhost" ? "http://localhost" : `https://${domain}`;
  const supabaseUrl = full ? `https://${supabaseHost}` : options.supabaseUrl?.replace(/\/$/, "");
  if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl)) fail("--supabase-url must be an HTTP(S) URL in managed mode.");
  if (!full && (!options.anonKey || !options.serviceRoleKey)) fail("managed mode requires --anon-key and --service-role-key.");
  const runtimeKeys = full
    ? { MINDDY_PUBLIC_SUPABASE_ANON_KEY: generated.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: generated.SERVICE_ROLE_KEY }
    : { MINDDY_PUBLIC_SUPABASE_ANON_KEY: options.anonKey, SUPABASE_SERVICE_ROLE_KEY: options.serviceRoleKey };
  return {
    ...generated,
    MINDDY_DEPLOY_DIR: options.deployDir,
    MINDDY_ENV_FILE: options.envFile,
    ...(options.image ? { MINDDY_IMAGE: options.image } : {}),
    MINDDY_HOST: domain,
    SUPABASE_HOST: supabaseHost || `supabase.${domain}`,
    CADDY_EMAIL: caddyEmail,
    MINDDY_EDITION: "self-hosted",
    MINDDY_PUBLIC_APP_URL: appUrl,
    MINDDY_PUBLIC_SUPABASE_URL: supabaseUrl,
    ...runtimeKeys,
    MINDDY_MANAGED_AI: "0",
    MINDDY_MANAGED_BILLING: "0",
    AGENT_EXECUTION_BACKEND: "local",
    MINDDY_SCHEDULER_URL: "http://minddy:3000",
    ADMIN_EMAILS: adminEmail,
    MINDDY_PUBLIC_CONTACT_EMAIL: adminEmail,
    SITE_URL: appUrl,
    SUPABASE_PUBLIC_URL: supabaseUrl,
    API_EXTERNAL_URL: `${supabaseUrl}/auth/v1`,
    ADDITIONAL_REDIRECT_URLS: `${appUrl}/auth/callback`,
  };
}

function command(command, args, { dryRun = false, env } = {}) {
  const visible = args.map((argument) => /postgres(?:ql)?:\/\//i.test(argument) ? "<database-url>" : argument);
  console.log(`→ ${command} ${visible.join(" ")}`);
  if (dryRun) return;
  const result = spawnSync(command, args, { cwd: ROOT_DIR, encoding: "utf8", env: { ...process.env, ...env } });
  if (result.error?.code === "ENOENT") fail(`command is missing: ${command}. Install it and rerun.`);
  if (result.status !== 0) fail((result.stderr || result.stdout || `${command} exited ${result.status}`).trim());
}

export function composeFiles(options) {
  const overlay = resolve(options.deployDir, `compose.${options.mode}.yml`);
  if (options.mode === "managed") return [overlay];
  if (!options.supabaseDir) fail("full mode requires --supabase-dir pointing to the pinned upstream checkout.");
  const upstream = resolve(options.supabaseDir, "docker/docker-compose.yml");
  if (!existsSync(upstream)) fail(`upstream Compose file is missing: ${upstream}. Run fetch-official-supabase first.`);
  return [upstream, overlay];
}

export function assertPrerequisites(options) {
  command("docker", ["info"], { dryRun: options.dryRun });
  command("docker", ["compose", "version"], { dryRun: options.dryRun });
  if (options.dryRun) return;
  for (const port of [80, 443]) {
    const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) fail(`port ${port} is already in use by process ${result.stdout.trim().split(/\s+/).join(", ")}.`);
    if (result.error?.code !== "ENOENT" && result.status !== 0 && result.status !== 1) {
      fail(`could not check port ${port}: ${(result.stderr || result.stdout).trim()}`);
    }
  }
}

async function ask(question, current, validate) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await readline.question(`${question}${current ? ` [${current}]` : ""}: `);
    return validate(answer.trim() || current);
  } finally {
    readline.close();
  }
}

export async function collectOptions(options) {
  if (!options.interactive) return options;
  if (!options.mode) options.mode = await ask("Deployment mode (managed/full)", "managed", (value) => {
    if (!['managed', 'full'].includes(value)) fail("mode must be managed or full.");
    return value;
  });
  if (!options.domain) options.domain = await ask("Public minddy hostname", undefined, normalizeHostname);
  if (!options.adminEmail) options.adminEmail = await ask("Administrator email", undefined, (value) => assertEmail(value, "administrator email"));
  if (!options.caddyEmail) options.caddyEmail = options.adminEmail;
  if (options.mode === "managed") {
    if (!options.supabaseUrl) options.supabaseUrl = await ask("Existing Supabase API URL", undefined, (value) => value);
    if (!options.anonKey) options.anonKey = await ask("Supabase anon key", undefined, (value) => value);
    if (!options.serviceRoleKey) options.serviceRoleKey = await ask("Supabase service-role key", undefined, (value) => value);
  } else {
    if (!options.supabaseDir) options.supabaseDir = await ask("Pinned upstream Supabase checkout", undefined, (value) => resolve(value));
    if (!options.supabaseHost) options.supabaseHost = await ask("Public Supabase API hostname", `supabase.${normalizeHostname(options.domain)}`, normalizeHostname);
  }
  if (!options.dbUrl && options.bootstrap) options.dbUrl = await ask("PostgreSQL URL for bootstrap", undefined, (value) => {
    if (!value) fail("a PostgreSQL URL is required unless --skip-bootstrap is used.");
    return value;
  });
  if (!options.capabilities.has("scheduler")) {
    const enableScheduler = await ask("Enable the optional scheduler? (yes/no)", "no", (value) => {
      if (!['yes', 'no'].includes(value.toLowerCase())) fail("answer yes or no.");
      return value.toLowerCase() === "yes";
    });
    if (enableScheduler) options.capabilities.add("scheduler");
  }
  return options;
}

function checkConfigFile(options) {
  if (existsSync(options.envFile)) fail(`${options.envFile} already exists. It was not changed; review it or select another --env-file.`);
  const template = resolve(options.deployDir, ".env.example");
  if (!existsSync(template)) fail(`environment template is missing: ${template}`);
  return readFileSync(template, "utf8");
}

function assertRequestedImage(options, values) {
  if (options.image && values.MINDDY_IMAGE !== options.image) {
    fail("--image does not match the existing environment file. Use the documented update procedure; the installer never changes a deployed image pin.");
  }
}

export async function main(argv = process.argv.slice(2)) {
  let options = parseArgs(argv);
  if (options.help) return console.log(help());
  const hasExistingEnvironment = existsSync(options.envFile);
  let values;
  let environment;
  if (hasExistingEnvironment) {
    values = parseEnvironment(readFileSync(options.envFile, "utf8"));
    assertCompleteEnvironment(values);
    assertRequestedImage(options, values);
    options.domain ||= values.MINDDY_HOST;
    options.adminEmail ||= values.ADMIN_EMAILS?.split(",")[0];
    options.caddyEmail ||= values.CADDY_EMAIL;
    options.supabaseUrl ||= values.MINDDY_PUBLIC_SUPABASE_URL;
    options.supabaseHost ||= values.SUPABASE_HOST;
    options.anonKey ||= values.MINDDY_PUBLIC_SUPABASE_ANON_KEY;
    options.serviceRoleKey ||= values.SUPABASE_SERVICE_ROLE_KEY;
    if (!options.mode && options.interactive) {
      options.mode = await ask("Deployment mode for the existing configuration (managed/full)", "managed", (value) => {
        if (!['managed', 'full'].includes(value)) fail("mode must be managed or full.");
        return value;
      });
    }
  } else {
    options = await collectOptions(options);
    if (!options.mode || !options.domain || !options.adminEmail) fail("--mode, --domain, and --admin-email are required with --non-interactive.");
    const template = checkConfigFile(options);
    values = environmentValues(options);
    environment = renderEnvironment(template, values);
  }
  if (!options.mode) fail("--mode is required when resuming an existing environment file.");
  if (options.bootstrap && !options.dbUrl) fail("--db-url is required unless --skip-bootstrap is used.");
  console.log(`This will ${hasExistingEnvironment ? "reuse" : "create"} ${options.envFile} (mode 0600), start the ${options.mode} Compose profile, and ${options.bootstrap ? "run" : "not run"} Supabase bootstrap.`);
  console.log(`Optional capabilities: ${options.capabilities.size ? [...options.capabilities].join(", ") : "none (scheduler and integrations stay disabled)"}.`);
  assertPrerequisites(options);
  if (hasExistingEnvironment) console.log("→ existing environment file left unchanged; resuming safe Compose/bootstrap phases.");
  else if (options.dryRun) console.log("→ would create the protected environment file without replacing an existing file.");
  else {
    createEnvironmentFile(options.envFile, environment);
  }
  recordCheckpoint(options.envFile, "configuration", options);
  if (!options.start) return console.log("✓ Configuration created. Start the stack later with pnpm self-host:doctor after it is running.");
  const files = composeFiles(options);
  const compose = ["compose", "--env-file", options.envFile, ...files.flatMap((file) => ["-f", file])];
  command("docker", [...compose, "pull"], { dryRun: options.dryRun });
  recordCheckpoint(options.envFile, "images-pulled", options);
  command("docker", [...compose, ...(options.capabilities.has("scheduler") ? ["--profile", "scheduled-jobs"] : []), "up", "-d", "--wait", "--wait-timeout", "60"], { dryRun: options.dryRun });
  recordCheckpoint(options.envFile, options.mode === "full" ? "database-started" : "application-stack-started", options);
  if (options.bootstrap) {
    const bootstrap = resolve(SCRIPT_DIR, "bootstrap-supabase.mjs");
    command(process.execPath, [bootstrap, "--db-url", options.dbUrl, "--env-file", options.envFile], {
      dryRun: options.dryRun,
      env: {
        MINDDY_PUBLIC_APP_URL: values.MINDDY_PUBLIC_APP_URL,
        MINDDY_PUBLIC_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
        MINDDY_PUBLIC_SUPABASE_ANON_KEY: values.MINDDY_PUBLIC_SUPABASE_ANON_KEY,
        SUPABASE_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY,
      },
    });
    recordCheckpoint(options.envFile, "migrations-and-storage-reconciled", options);
  }
  recordCheckpoint(options.envFile, "application-healthy", options);
  console.log(`✓ minddy is available at ${values.MINDDY_PUBLIC_APP_URL}. Run pnpm self-host:doctor -- --env-file ${options.envFile} --mode ${options.mode}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
