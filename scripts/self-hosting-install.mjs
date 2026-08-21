#!/usr/bin/env node
/**
 * Guided, non-destructive installer for the reference self-hosted profiles.
 *
 * The generated environment file is deliberately readable and remains owned by
 * the operator. This script refuses to replace it; rerunning it resumes only
 * the phase commands that are safe to repeat.
 */
import { createECDH, createHmac, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
export const DEFAULT_DEPLOY_DIR = resolve(ROOT_DIR, "deploy/self-hosted");
const DEFAULT_ENV_FILE = resolve(DEFAULT_DEPLOY_DIR, ".env");
export const OPTIONAL_CAPABILITIES = ["application-email", "web-push"];

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
    else if (arg === "--app-url") options.appUrl = value();
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
    } else if (arg === "--no-forge-relay") {
      options.forgeRelay = false;
    } else if (arg === "--non-interactive") options.interactive = false;
    else if (arg === "--skip-start") options.start = false;
    else if (arg === "--skip-bootstrap") options.bootstrap = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else fail(`unknown option: ${arg}. See --help.`);
  }
  if (options.mode && !["managed", "full"].includes(options.mode)) fail("--mode must be managed or full.");
  if (options.domain && options.appUrl) fail("use either --domain or --app-url, not both.");
  return options;
}

export function help() {
  return `Usage: pnpm self-host:install -- [options]

The installer explains each step and will never replace an existing environment file.

Options:
  --mode managed|full       Supabase Cloud or the complete official stack.
  --app-url <origin>        minddy origin. Private HTTP IPs and public HTTPS are supported.
  --domain <hostname>       Backward-compatible shortcut for https://<hostname>.
  --admin-email <email>     First instance administrator email.
  --caddy-email <email>     Certificate notification email (defaults to admin).
  --supabase-url <https-url> --anon-key <key> --service-role-key <key>
                              Supabase Cloud credentials for managed mode.
  --supabase-dir <path>     Pinned upstream Supabase checkout for full mode.
  --supabase-host <hostname> Public API hostname for full HTTPS mode.
  --db-url <postgres-url>   Migration connection for managed mode. Full mode derives it.
  --image <oci-reference>   Verified immutable minddy OCI digest to deploy.
  --enable <feature>         Enable application-email or web-push.
                              Repeat for multiple features. Routines are included.
  --no-forge-relay           Opt out of the managed forge relay: GitHub/GitLab
                              then require operator-owned app credentials, and
                              nothing ever contacts minddy infrastructure.
  --env-file <path>         Environment file to create (default: deploy/self-hosted/.env).
  --deploy-dir <path>       Versioned self-hosted asset directory.
  --skip-start              Create configuration without starting containers.
  --skip-bootstrap           Start containers without applying migrations/buckets.
  --non-interactive         Require every required option on the command line.
  --dry-run                 Show actions without writing or starting anything.
  -h, --help                Show this help.

All optional integrations are disabled. Public deployments require DNS and firewall
ports 80/443. Private HTTP deployments must remain on a trusted private network;
the full stack also serves its Supabase API on LAN port 8000.`;
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

function isPrivateIpv4(hostname) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254);
}

export function normalizeAppOrigin(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    fail(`invalid app URL: ${value}. Use an absolute origin such as https://minddy.example.com or http://192.168.1.50.`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port) {
    fail("--app-url must be an origin without credentials, a path, query, or custom port.");
  }
  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && (url.hostname === "localhost" || isPrivateIpv4(url.hostname))) return url.origin;
  fail("--app-url must use HTTPS, except for localhost or a private IPv4 address.");
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

export function generatedValues(capabilities = new Set()) {
  const secret = () => randomBytes(32).toString("hex");
  const jwtSecret = secret();
  const values = {
    AI_KEY_ENCRYPTION_SECRET: secret(),
    FEEDBACK_SSO_ENCRYPTION_SECRET: secret(),
    POSTGRES_PASSWORD: secret(),
    JWT_SECRET: jwtSecret,
    ANON_KEY: createSupabaseJwt(jwtSecret, "anon"),
    SERVICE_ROLE_KEY: createSupabaseJwt(jwtSecret, "service_role"),
    DASHBOARD_PASSWORD: secret(),
    SECRET_KEY_BASE: secret(),
    REALTIME_DB_ENC_KEY: randomBytes(8).toString("hex"),
    VAULT_ENC_KEY: randomBytes(16).toString("hex"),
    PG_META_CRYPTO_KEY: secret(),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: secret(),
    LOGFLARE_PRIVATE_ACCESS_TOKEN: secret(),
    S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
    S3_PROTOCOL_ACCESS_KEY_SECRET: secret(),
    MINIO_ROOT_PASSWORD: secret(),
    POOLER_TENANT_ID: randomBytes(12).toString("hex"),
    AGENT_RUNNER_SECRET: secret(),
    CRON_SECRET: secret(),
    // Forge secrets are ALWAYS generated: GitHub/GitLab connect through the
    // managed forge relay by default (credentials provisioned on first
    // connect), and both local and relayed tokens encrypt at rest with these.
    GIT_STATE_SECRET: secret(),
    GIT_TOKEN_ENCRYPTION_SECRET: secret(),
  };
  if (capabilities.has("web-push")) {
    const vapid = createECDH("prime256v1");
    vapid.generateKeys();
    values.MINDDY_PUBLIC_VAPID_PUBLIC_KEY = vapid.getPublicKey().toString("base64url");
    values.VAPID_PRIVATE_KEY = vapid.getPrivateKey().toString("base64url");
  }
  return values;
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

export function combineFullEnvironmentTemplates(upstream, minddy) {
  return `${upstream.trimEnd()}\n\n# minddy deployment values\n${minddy.trimStart()}`;
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

export function environmentValues(options, generated = generatedValues(options.capabilities)) {
  const appUrl = options.appUrl
    ? normalizeAppOrigin(options.appUrl)
    : normalizeAppOrigin(options.domain === "localhost" ? "http://localhost" : `https://${normalizeHostname(options.domain)}`);
  const domain = new URL(appUrl).hostname;
  const adminEmail = assertEmail(options.adminEmail, "--admin-email");
  const caddyEmail = assertEmail(options.caddyEmail || adminEmail, "--caddy-email");
  const full = options.mode === "full";
  const privateFull = full && appUrl.startsWith("http://");
  const supabaseHost = full
    ? (privateFull ? domain : normalizeHostname(options.supabaseHost || `supabase.${domain}`))
    : undefined;
  const supabaseUrl = full
    ? (privateFull ? `http://${domain}:8000` : `https://${supabaseHost}`)
    : options.supabaseUrl?.replace(/\/$/, "");
  if (!supabaseUrl || !/^https?:\/\//.test(supabaseUrl)) fail("--supabase-url must be an HTTP(S) URL in managed mode.");
  if (!full && (!options.anonKey || !options.serviceRoleKey)) fail("managed mode requires --anon-key and --service-role-key.");
  const runtimeKeys = full
    ? { MINDDY_PUBLIC_SUPABASE_ANON_KEY: generated.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: generated.SERVICE_ROLE_KEY }
    : { MINDDY_PUBLIC_SUPABASE_ANON_KEY: options.anonKey, SUPABASE_SERVICE_ROLE_KEY: options.serviceRoleKey };
  const capabilities = options.capabilities ?? new Set();
  return {
    ...generated,
    MINDDY_DEPLOY_DIR: options.deployDir,
    MINDDY_ENV_FILE: options.envFile,
    ...(options.image ? { MINDDY_IMAGE: options.image } : {}),
    MINDDY_HOST: domain,
    MINDDY_SITE_ADDRESS: appUrl.startsWith("http://") ? appUrl : domain,
    SUPABASE_HOST: supabaseHost || `supabase.${domain}`,
    SUPABASE_SITE_ADDRESS: privateFull ? supabaseUrl : (supabaseHost || `supabase.${domain}`),
    CADDY_EMAIL: caddyEmail,
    MINDDY_SUPABASE_HTTP_BIND_ADDRESS: privateFull ? "0.0.0.0" : "127.0.0.1",
    MINDDY_SUPABASE_HTTP_PORT: "8000",
    MINDDY_POSTGRES_BIND_PORT: "54322",
    MINDDY_EDITION: "self-hosted",
    MINDDY_PUBLIC_APP_URL: appUrl,
    MINDDY_PUBLIC_SUPABASE_URL: supabaseUrl,
    ...runtimeKeys,
    MINDDY_MANAGED_AI: "0",
    MINDDY_MANAGED_BILLING: "0",
    // Forge relay opt-out only: the default (empty) keeps the automatic
    // provisioning of the relay identity on first connect.
    ...(options.forgeRelay === false ? { MINDDY_FORGE_RELAY: "0" } : {}),
    MINDDY_SELF_HOST_FEATURES: [...capabilities].join(","),
    AGENT_EXECUTION_BACKEND: "self-hosted",
    AGENT_RUNNER_URL: "http://agent-runner:6464",
    AGENT_CONTROL_ORIGIN: "http://minddy:3000",
    EMAIL_PROVIDER: capabilities.has("application-email") ? "resend" : "",
    VAPID_SUBJECT: capabilities.has("web-push") ? `mailto:${adminEmail}` : "",
    MINDDY_SCHEDULER_URL: "http://minddy:3000",
    ADMIN_EMAILS: adminEmail,
    MINDDY_PUBLIC_CONTACT_EMAIL: adminEmail,
    SITE_URL: appUrl,
    SUPABASE_PUBLIC_URL: supabaseUrl,
    API_EXTERNAL_URL: `${supabaseUrl}/auth/v1`,
    ADDITIONAL_REDIRECT_URLS: `${appUrl}/auth/callback`,
    SMTP_ADMIN_EMAIL: adminEmail,
    SMTP_SENDER_NAME: "minddy",
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
  const ports = options.mode === "full" ? [80, 443, 8000] : [80, 443];
  for (const port of ports) {
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
  if (!options.domain && !options.appUrl) options.appUrl = await ask(
    "minddy URL (public HTTPS domain or private HTTP IP)",
    undefined,
    normalizeAppOrigin,
  );
  if (!options.adminEmail) options.adminEmail = await ask("Administrator email", undefined, (value) => assertEmail(value, "administrator email"));
  if (!options.caddyEmail) options.caddyEmail = options.adminEmail;
  if (options.mode === "managed") {
    if (!options.supabaseUrl) options.supabaseUrl = await ask("Supabase Cloud project URL", undefined, (value) => value);
    if (!options.anonKey) options.anonKey = await ask("Supabase anon key", undefined, (value) => value);
    if (!options.serviceRoleKey) options.serviceRoleKey = await ask("Supabase service-role key", undefined, (value) => value);
  } else {
    if (!options.supabaseDir) options.supabaseDir = await ask("Pinned upstream Supabase checkout", undefined, (value) => resolve(value));
    const appUrl = options.appUrl
      ? normalizeAppOrigin(options.appUrl)
      : normalizeAppOrigin(`https://${normalizeHostname(options.domain)}`);
    if (appUrl.startsWith("https://") && !options.supabaseHost) {
      options.supabaseHost = await ask("Public Supabase API hostname", `supabase.${new URL(appUrl).hostname}`, normalizeHostname);
    }
  }
  if (options.mode === "managed" && !options.dbUrl && options.bootstrap) options.dbUrl = await ask("PostgreSQL URL for bootstrap", undefined, (value) => {
    if (!value) fail("a PostgreSQL URL is required unless --skip-bootstrap is used.");
    return value;
  });
  if (options.capabilities.size === 0) {
    const selected = await ask(
      "Optional features (comma-separated: application-email, web-push; blank for none)",
      "none",
      (value) => value.toLowerCase(),
    );
    if (selected !== "none") {
      for (const capability of selected.split(",").map((value) => value.trim()).filter(Boolean)) {
        if (!OPTIONAL_CAPABILITIES.includes(capability)) fail(`unknown optional capability: ${capability}.`);
        options.capabilities.add(capability);
      }
    }
  }
  return options;
}

export function inferCapabilities(values) {
  const capabilities = new Set();
  for (const capability of (values.MINDDY_SELF_HOST_FEATURES || "").split(",").map((value) => value.trim())) {
    if (OPTIONAL_CAPABILITIES.includes(capability)) capabilities.add(capability);
  }
  if (values.EMAIL_PROVIDER === "resend") capabilities.add("application-email");
  if (values.MINDDY_PUBLIC_VAPID_PUBLIC_KEY || values.VAPID_PRIVATE_KEY) capabilities.add("web-push");
  return capabilities;
}

function checkConfigFile(options) {
  if (existsSync(options.envFile)) fail(`${options.envFile} already exists. It was not changed; review it or select another --env-file.`);
  const template = resolve(options.deployDir, ".env.example");
  if (!existsSync(template)) fail(`environment template is missing: ${template}`);
  const minddyTemplate = readFileSync(template, "utf8");
  if (options.mode !== "full") return minddyTemplate;
  if (!options.supabaseDir) fail("full mode requires --supabase-dir pointing to the pinned upstream checkout.");
  const upstreamTemplate = resolve(options.supabaseDir, "docker/.env.example");
  if (!existsSync(upstreamTemplate)) fail(`upstream environment template is missing: ${upstreamTemplate}. Run fetch-official-supabase first.`);
  return combineFullEnvironmentTemplates(readFileSync(upstreamTemplate, "utf8"), minddyTemplate);
}

export function fullBootstrapDatabaseUrl(values) {
  const password = values.POSTGRES_PASSWORD;
  if (!password) fail("POSTGRES_PASSWORD is missing from the full-stack environment.");
  const port = values.MINDDY_POSTGRES_BIND_PORT || "54322";
  if (!/^\d{2,5}$/.test(port)) fail("MINDDY_POSTGRES_BIND_PORT must be a TCP port.");
  return `postgresql://postgres:${encodeURIComponent(password)}@127.0.0.1:${port}/postgres`;
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
    options.appUrl ||= values.MINDDY_PUBLIC_APP_URL;
    options.adminEmail ||= values.ADMIN_EMAILS?.split(",")[0];
    options.caddyEmail ||= values.CADDY_EMAIL;
    options.supabaseUrl ||= values.MINDDY_PUBLIC_SUPABASE_URL;
    options.supabaseHost ||= values.SUPABASE_HOST;
    options.anonKey ||= values.MINDDY_PUBLIC_SUPABASE_ANON_KEY;
    options.serviceRoleKey ||= values.SUPABASE_SERVICE_ROLE_KEY;
    for (const capability of inferCapabilities(values)) options.capabilities.add(capability);
    if (!options.mode && options.interactive) {
      options.mode = await ask("Deployment mode for the existing configuration (managed/full)", "managed", (value) => {
        if (!['managed', 'full'].includes(value)) fail("mode must be managed or full.");
        return value;
      });
    }
  } else {
    options = await collectOptions(options);
    if (!options.mode || (!options.domain && !options.appUrl) || !options.adminEmail) fail("--mode, --app-url (or --domain), and --admin-email are required with --non-interactive.");
    const template = checkConfigFile(options);
    values = environmentValues(options);
    environment = renderEnvironment(template, values);
  }
  if (!options.mode) fail("--mode is required when resuming an existing environment file.");
  if (options.mode === "full" && options.bootstrap && !options.dbUrl) {
    options.dbUrl = fullBootstrapDatabaseUrl(values);
  }
  if (options.bootstrap && !options.dbUrl) fail("--db-url is required unless --skip-bootstrap is used.");
  console.log(`This will ${hasExistingEnvironment ? "reuse" : "create"} ${options.envFile} (mode 0600), start the ${options.mode} Compose profile, and ${options.bootstrap ? "run" : "not run"} Supabase bootstrap.`);
  console.log(`Optional integrations: ${options.capabilities.size ? [...options.capabilities].join(", ") : "none"}. Scheduled routines and server agent sandboxes are included.`);
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
  command("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "60"], { dryRun: options.dryRun });
  recordCheckpoint(options.envFile, options.mode === "full" ? "database-started" : "application-stack-started", options);
  if (options.bootstrap) {
    const bootstrap = resolve(SCRIPT_DIR, "bootstrap-supabase.mjs");
    // Forge secrets are generated unconditionally (relay-first default), so
    // the bootstrap only needs to know about the scheduler.
    command(process.execPath, [bootstrap, "--db-url", options.dbUrl, "--env-file", options.envFile, "--enable", "scheduler"], {
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
