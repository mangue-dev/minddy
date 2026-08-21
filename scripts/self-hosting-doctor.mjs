#!/usr/bin/env node
/** Read-only diagnostics for an installed reference self-hosted profile. */
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync, statfsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

import { parseEnvironment } from "./self-hosting-install.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
const DEFAULT_DEPLOY_DIR = resolve(ROOT_DIR, "deploy/self-hosted");
const OPTIONAL_INTEGRATIONS = [
  "MINDDY_MANAGED_AI",
  "MINDDY_MANAGED_BILLING",
  "MINDDY_MANAGED_FORGE",
  "MINDDY_FORGE_RELAY_URL",
  "STRIPE_SECRET_KEY",
  "POSTHOG_API_KEY",
  "RESEND_API_KEY",
  "GITHUB_CLIENT_ID",
  "GITLAB_CLIENT_ID",
];

export function parseArgs(argv) {
  const options = { deployDir: DEFAULT_DEPLOY_DIR, envFile: resolve(DEFAULT_DEPLOY_DIR, ".env"), mode: "managed", network: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new Error(`${arg} expects a value.`);
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--env-file") options.envFile = resolve(value());
    else if (arg === "--deploy-dir") options.deployDir = resolve(value());
    else if (arg === "--mode") options.mode = value();
    else if (arg === "--supabase-compose") options.supabaseCompose = resolve(value());
    else if (arg === "--db-url") options.dbUrl = value();
    else if (arg === "--skip-network") options.network = false;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option: ${arg}. See --help.`);
  }
  if (!['managed', 'full'].includes(options.mode)) throw new Error("--mode must be managed or full.");
  return options;
}

export function help() {
  return `Usage: pnpm self-host:doctor -- [options]

This command is read-only and never prints environment values or secrets.

Options:
  --env-file <path>          Protected deployment environment file.
  --mode managed|full        Reference Compose profile (default: managed).
  --supabase-compose <path>  Upstream Compose file required for full mode.
  --db-url <postgres-url>    Enables read-only migration and Storage checks.
  --skip-network             Skip DNS, TLS, and public health checks.
  --json                     Emit a machine-readable redacted report.
  -h, --help                 Show this help.`;
}

export function redact(text) {
  return String(text)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
}

export function configFindings(values) {
  const required = [
    "MINDDY_HOST",
    "MINDDY_PUBLIC_APP_URL",
    "MINDDY_PUBLIC_SUPABASE_URL",
    "MINDDY_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ADMIN_EMAILS",
    "AGENT_EXECUTION_BACKEND",
    "AGENT_RUNNER_URL",
    "AGENT_RUNNER_SECRET",
    "CRON_SECRET",
  ];
  return required.filter((key) => !values[key] || values[key].startsWith("replace-with"));
}

export function disabledCapabilities(values) {
  return OPTIONAL_INTEGRATIONS.filter((name) => {
    const value = values[name]?.trim();
    return !value || value === "0" || value.toLowerCase() === "false";
  });
}

/**
 * How this installation reaches github.com/gitlab.com: the managed forge
 * relay, an operator-owned app, or nothing. The operator-owned app takes
 * precedence for new connections when both are configured (existing
 * connections keep the channel they were established through), mirroring
 * `lib/capabilities.ts`. The relay is the DEFAULT: with no operator-owned
 * app and no explicit opt-out (`--no-forge-relay` → MINDDY_FORGE_RELAY=0),
 * the instance provisions its relay identity automatically on first connect.
 *
 * Both relay modes (pinned variables or automatic provisioning) store
 * relayed tokens encrypted at rest and sign git states with instance-side
 * secrets: without them every connect fails at use time, exactly like the
 * `incomplete` state of the capability catalog.
 */
export function forgeAccessFinding(values) {
  const relayConfigured = Boolean(
    values.MINDDY_FORGE_RELAY_URL?.trim() &&
      values.MINDDY_FORGE_RELAY_INSTANCE_ID?.trim() &&
      values.MINDDY_FORGE_RELAY_SECRET?.trim(),
  );
  const githubLocal = Boolean(values.GITHUB_APP_ID?.trim() && values.GITHUB_APP_SLUG?.trim() && values.GITHUB_APP_PRIVATE_KEY?.trim());
  const gitlabLocal = Boolean(values.GITLAB_OAUTH_CLIENT_ID?.trim() && values.GITLAB_OAUTH_CLIENT_SECRET?.trim());
  if (githubLocal || gitlabLocal) {
    return {
      name: "Forge access",
      state: "pass",
      detail: `operator-owned app (${[githubLocal && "GitHub", gitlabLocal && "GitLab"].filter(Boolean).join(", ")}).`,
    };
  }
  if (values.MINDDY_FORGE_RELAY?.trim() === "0") {
    return {
      name: "Forge access",
      state: "pass",
      detail: "disabled: forge relay opt-out (--no-forge-relay) and no operator-owned app.",
    };
  }
  const missingState = !values.GIT_STATE_SECRET?.trim();
  const missingTokenCrypto = !(
    values.GIT_TOKEN_ENCRYPTION_SECRET?.trim() ||
    values.GITLAB_TOKEN_ENCRYPTION_SECRET?.trim()
  );
  const missingSecrets = [
    ...(missingState ? ["GIT_STATE_SECRET"] : []),
    ...(missingTokenCrypto ? ["GIT_TOKEN_ENCRYPTION_SECRET"] : []),
  ];
  if (relayConfigured) {
    const webhookSecret = values.MINDDY_FORGE_RELAY_WEBHOOK_SECRET?.trim() ?? "";
    const missingWebhookSecret = !webhookSecret || webhookSecret.length < 32;
    if (missingWebhookSecret || missingSecrets.length > 0) {
      const missing = [
        ...missingSecrets,
        ...(missingWebhookSecret ? ["MINDDY_FORGE_RELAY_WEBHOOK_SECRET (32+ characters)"] : []),
      ];
      return {
        name: "Forge access",
        state: "fail",
        detail: `managed forge relay is configured but missing: ${missing.join(", ")}.`,
      };
    }
    return {
      name: "Forge access",
      state: "pass",
      detail: "managed forge relay (github, gitlab); no operator-owned app variables are read.",
    };
  }
  const partial = values.MINDDY_FORGE_RELAY_URL?.trim() || values.MINDDY_FORGE_RELAY_INSTANCE_ID?.trim() || values.MINDDY_FORGE_RELAY_SECRET?.trim();
  if (partial) {
    return {
      name: "Forge access",
      state: "pass",
      detail: "forge relay configuration is incomplete; the automatic relay provisioning stays available unless the partial variables are removed.",
    };
  }
  if (missingSecrets.length > 0) {
    return {
      name: "Forge access",
      state: "fail",
      detail: `managed forge relay (automatic) is the default channel but missing: ${missingSecrets.join(", ")}.`,
    };
  }
  return {
    name: "Forge access",
    state: "pass",
    detail: "managed forge relay (automatic): GitHub and GitLab connect from within the app; credentials are provisioned on first connect.",
  };
}

function composeFiles(options) {
  const overlay = resolve(options.deployDir, `compose.${options.mode}.yml`);
  if (options.mode === "managed") return [overlay];
  if (!options.supabaseCompose) throw new Error("full mode requires --supabase-compose pointing to the pinned upstream Compose file.");
  return [options.supabaseCompose, overlay];
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: ROOT_DIR, encoding: "utf8", env: { ...process.env, ...env } });
  if (result.error) return { ok: false, detail: result.error.code === "ENOENT" ? `${command} is not installed.` : result.error.message };
  return { ok: result.status === 0, detail: redact((result.stderr || result.stdout).trim()), stdout: result.stdout };
}

function composeStatus(options) {
  let files;
  try {
    files = composeFiles(options);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
  const result = run("docker", ["compose", "--env-file", options.envFile, ...files.flatMap((file) => ["-f", file]), "ps", "--format", "json"]);
  if (!result.ok) return result;
  try {
    const output = result.stdout.trim();
    let parsed = output ? JSON.parse(output) : [];
    if (!Array.isArray(parsed)) parsed = [parsed];
    const records = parsed;
    const unhealthy = records.filter((record) => /unhealthy|exited|dead/i.test(`${record.Health ?? ""} ${record.State ?? ""}`));
    return { ok: records.length > 0 && unhealthy.length === 0, detail: records.length === 0 ? "no Compose services are running." : unhealthy.length ? `${unhealthy.map((record) => record.Service ?? record.Name).join(", ")} is not healthy.` : `${records.length} services are running.`, records };
  } catch {
    try {
      const records = result.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
      const unhealthy = records.filter((record) => /unhealthy|exited|dead/i.test(`${record.Health ?? ""} ${record.State ?? ""}`));
      return { ok: records.length > 0 && unhealthy.length === 0, detail: records.length === 0 ? "no Compose services are running." : unhealthy.length ? `${unhealthy.map((record) => record.Service ?? record.Name).join(", ")} is not healthy.` : `${records.length} services are running.`, records };
    } catch {
      return { ok: false, detail: "Docker Compose returned an unreadable status." };
    }
  }
}

async function networkFindings(values) {
  const findings = [];
  const hostname = values.MINDDY_HOST;
  const appUrl = values.MINDDY_PUBLIC_APP_URL;
  const privateHttp = appUrl?.startsWith("http://");
  if (!hostname || hostname === "localhost") {
    findings.push({ name: "Network address", state: "warn", detail: "public DNS/TLS check skipped for localhost." });
  } else if (privateHttp) {
    findings.push({ name: "Network address", state: "warn", detail: "private HTTP mode is enabled; keep the server behind the LAN firewall and do not forward its ports." });
  } else {
    try {
      const addresses = await lookup(hostname, { all: true });
      findings.push({ name: "DNS", state: "pass", detail: `${addresses.length} DNS record(s) resolve.` });
    } catch (error) {
      findings.push({ name: "DNS", state: "fail", detail: redact(error instanceof Error ? error.message : error) });
    }
  }
  try {
    const response = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`, { signal: AbortSignal.timeout(10_000) });
    findings.push({ name: privateHttp ? "Application health" : "TLS and application health", state: response.ok ? "pass" : "fail", detail: response.ok ? `Health endpoint returned ${response.status}.` : `health endpoint returned ${response.status}.` });
  } catch (error) {
    findings.push({ name: "TLS and application health", state: "fail", detail: redact(error instanceof Error ? error.message : error) });
  }
  return findings;
}

export function compatibilityFinding(values) {
  const path = resolve(ROOT_DIR, "deploy/self-hosted/compatibility.json");
  const compatibility = JSON.parse(readFileSync(path, "utf8"));
  const entry = compatibility.entries.find((candidate) => candidate.minddyRelease === values.MINDDY_RELEASE);
  if (!entry) return { name: "Version compatibility", state: "fail", detail: "MINDDY_RELEASE has no compatibility entry." };
  const image = values.MINDDY_IMAGE;
  const immutableReleaseImage = /^ghcr\.io\/mangue-dev\/minddy@sha256:[a-f0-9]{64}$/.test(image ?? "");
  if (entry.referenceCompose.minddyImage !== image && !immutableReleaseImage) {
    return { name: "Version compatibility", state: "fail", detail: "MINDDY_IMAGE does not match the selected release compatibility row or a verified immutable minddy digest." };
  }
  return {
    name: "Version compatibility",
    state: "pass",
    detail: immutableReleaseImage
      ? `release ${values.MINDDY_RELEASE} uses an immutable image digest; verify its release-manifest.json before deployment.`
      : `release ${values.MINDDY_RELEASE} matches its compatibility row.`,
  };
}

function diskFinding(directory) {
  try {
    const stats = statfsSync(directory);
    const available = Number(stats.bavail) * Number(stats.bsize);
    const gib = available / 1024 ** 3;
    return { name: "Disk space", state: gib < 5 ? "warn" : "pass", detail: `${gib.toFixed(1)} GiB available on the deployment filesystem.` };
  } catch (error) {
    return { name: "Disk space", state: "warn", detail: redact(error instanceof Error ? error.message : error) };
  }
}

function verificationFinding(options, values) {
  if (!options.dbUrl) return { name: "Database, Storage, and migrations", state: "warn", detail: "not checked; rerun with --db-url to verify PostgreSQL, migration state, and Storage." };
  const result = run(process.execPath, [resolve(SCRIPT_DIR, "verify-supabase-bootstrap.mjs"), "--from-bootstrap-env"], {
    MDY_BOOTSTRAP_DB_URL: options.dbUrl,
    MDY_BOOTSTRAP_SUPABASE_URL: values.MINDDY_PUBLIC_SUPABASE_URL,
    MDY_BOOTSTRAP_SERVICE_ROLE_KEY: values.SUPABASE_SERVICE_ROLE_KEY,
  });
  return { name: "Database, Storage, and migrations", state: result.ok ? "pass" : "fail", detail: result.ok ? "PostgreSQL, migration invariants, and Storage buckets verified." : result.detail || "verification failed." };
}

export async function diagnose(options) {
  const findings = [];
  if (!existsSync(options.envFile)) return [{ name: "Configuration", state: "fail", detail: "environment file is missing." }];
  const values = parseEnvironment(readFileSync(options.envFile, "utf8"));
  const missing = configFindings(values);
  findings.push({ name: "Configuration", state: missing.length ? "fail" : "pass", detail: missing.length ? `missing or placeholder values: ${missing.join(", ")}.` : "required self-hosted configuration is present (values redacted)." });
  findings.push(compatibilityFinding(values));
  const status = composeStatus(options);
  findings.push({ name: "Container health", state: status.ok ? "pass" : "fail", detail: status.detail });
  findings.push(verificationFinding(options, values));
  const schedulerEnabled = Boolean(status.records?.some((record) => /scheduler/.test(record.Service ?? record.Name ?? "")));
  findings.push({ name: "Scheduler", state: schedulerEnabled ? "pass" : "fail", detail: schedulerEnabled ? "routine scheduler container is running." : "routine scheduler container is missing." });
  const runnerEnabled = Boolean(status.records?.some((record) => /agent-runner/.test(record.Service ?? record.Name ?? "")));
  findings.push({ name: "Agent runner", state: runnerEnabled ? "pass" : "fail", detail: runnerEnabled ? "server sandbox runner container is running." : "server sandbox runner container is missing." });
  findings.push(diskFinding(options.deployDir));
  findings.push(forgeAccessFinding(values));
  findings.push({ name: "Optional capabilities", state: "pass", detail: `${disabledCapabilities(values).join(", ")} disabled or unconfigured.` });
  if (options.network) findings.push(...await networkFindings(values));
  return findings;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return console.log(help());
  const findings = await diagnose(options);
  if (options.json) console.log(JSON.stringify({ findings }, null, 2));
  else for (const finding of findings) console.log(`${finding.state === "pass" ? "✓" : finding.state === "warn" ? "!" : "✗"} ${finding.name}: ${finding.detail}`);
  if (findings.some((finding) => finding.state === "fail")) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Self-hosted diagnosis failed: ${redact(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  });
}
