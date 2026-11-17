#!/usr/bin/env node
/**
 * The repository "vulnerabilities" gate (MIN-335) — a single definition, read by
 * the CI ([.github/workflows/ci.yml]) as by [deploy.sh].
 *
 * It fixes two blind spots of the old `npm audit --omit=dev` :
 *
 * 1. **The executable lockfiles.** CI installs the root with pnpm and packages
 * the desktop shell from its npm project, so those are the two dependency
 * trees that ship. The root `package-lock.json` is a compatibility projection
 * for tools that cannot read pnpm; auditing its 1,000+ package npm tree was
 * both redundant and the recurring source of Bulk Advisory Endpoint timeouts.
 *
 * 2. **`--omit=dev` hid the build chain.** The reasoning ("the build tools
 * are not exposed in prod") does not hold: `esbuild` produces
 * the bundles actually delivered (agent VM, page projection, shell
 * macOS) and `tailwindcss` produces the CSS served to visitors. A compromised
 * packet in this chain does not need to be in `dependencies` for
 * to end up in whatever the user is executing. We therefore audit the ENTIRE tree.
 *
 * Threshold: `high`. A high or critical vuln causes the process to fail.
 *
 * Each audit runs with `--json`, so the gate decides from the advisories
 * themselves. An advisory listed in `AUDIT_EXCEPTIONS` stops failing the gate
 * until its `expires` date, then fails it again: an exception is a dated
 * decision, never a silent mute. Every other high or critical advisory still
 * fails the gate.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RETRY_DELAYS_MS = [5_000, 15_000];
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const ATTEMPT_TIMEOUT_MS = 90_000;

const TRANSIENT_AUDIT_FAILURES = [
  /\b(?:ERR_SOCKET_TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENETUNREACH|ENOTFOUND)\b/i,
  /\bnetwork timeout\b/i,
  /\bsocket hang up\b/i,
  /\bERR_PNPM_AUDIT_BAD_RESPONSE\b/i,
  /\b(?:HTTP|status(?: code)?)\s*(?:429|5\d\d)\b/i,
  /\b(?:429 Too Many Requests|5\d\d (?:Bad Gateway|Gateway Timeout|Internal Server Error|Service Unavailable))\b/i,
];

export const AUDIT_RESULT = {
  passed: "passed",
  failed: "failed",
  unavailable: "unavailable",
};

/**
 * High or critical advisories accepted for a limited time, by GHSA id. Add one
 * only when no patched version exists, record why the risk is acceptable, and
 * keep `expires` close: once it passes, the gate fails again and the decision
 * has to be made again.
 */
export const AUDIT_EXCEPTIONS = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    package: "picomatch",
    expires: "2026-12-17",
    reason:
      "ReDoS through repeated extglobs; every published picomatch version is affected (no patch as of " +
      "2026-11-17). It is reached only through build and test tooling (vitest, electron-builder, node-gyp) " +
      "matching patterns written in this repository, never through user input.",
  },
];

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/** The UTC calendar day of `now`, as `YYYY-MM-DD`. */
function today(now) {
  return now.toISOString().slice(0, 10);
}

/** The exception that covers this advisory id on `now`, if any (it covers its `expires` day). */
export function activeException(id, { exceptions = AUDIT_EXCEPTIONS, now = new Date() } = {}) {
  return exceptions.find((exception) => exception.id === id && today(now) <= exception.expires) ?? null;
}

function ghsaFromUrl(url) {
  return typeof url === "string" ? (url.match(/GHSA-[\w-]+/)?.[0] ?? null) : null;
}

/**
 * The advisories in an audit's JSON report, from pnpm (`advisories`) or npm
 * (`vulnerabilities[].via`, where an object is an advisory and a string only
 * points at another package). Returns `null` when the output is not a report.
 */
export function parseAuditAdvisories(output) {
  let report;
  try {
    report = JSON.parse(output);
  } catch {
    return null;
  }
  if (!report || typeof report !== "object") return null;

  const advisories = new Map();
  const add = (id, severity, packageName, title) => {
    if (!id || advisories.has(id)) return;
    advisories.set(id, { id, severity, package: packageName, title });
  };

  if (report.advisories && typeof report.advisories === "object") {
    for (const advisory of Object.values(report.advisories)) {
      add(
        advisory.github_advisory_id ?? ghsaFromUrl(advisory.url),
        advisory.severity,
        advisory.module_name,
        advisory.title,
      );
    }
    return [...advisories.values()];
  }

  if (report.vulnerabilities && typeof report.vulnerabilities === "object") {
    for (const vulnerability of Object.values(report.vulnerabilities)) {
      for (const via of vulnerability.via ?? []) {
        if (via && typeof via === "object") add(ghsaFromUrl(via.url), via.severity, via.name, via.title);
      }
    }
    return [...advisories.values()];
  }

  return null;
}

/** Split a report's advisories into those that fail the gate and those an exception covers. */
export function classifyAdvisories(advisories, options) {
  const blocking = [];
  const excepted = [];
  for (const advisory of advisories) {
    if (!BLOCKING_SEVERITIES.has(advisory.severity)) continue;
    const exception = activeException(advisory.id, options);
    if (exception) excepted.push({ ...advisory, expires: exception.expires });
    else blocking.push(advisory);
  }
  return { blocking, excepted };
}

/** The lockfiles that resolve code installed or packaged by CI. */
export const AUDIT_TARGETS = [
  {
    label: "root — pnpm-lock.yaml (the actually installed tree)",
    cwd: ROOT,
    command: "pnpm",
    args: ["audit", "--json"],
  },
  {
    label: "desktop — package-lock.json (macOS shell)",
    cwd: path.join(ROOT, "desktop"),
    command: "npm",
    args: ["audit", "--json"],
  },
  {
    label: "mobile — package-lock.json (Capacitor shell)",
    cwd: path.join(ROOT, "mobile"),
    command: "npm",
    args: ["audit", "--json"],
  },
];

/** Return true only for registry and network failures that may succeed on retry. */
export function isTransientAuditFailure(output) {
  return TRANSIENT_AUDIT_FAILURES.some((pattern) => pattern.test(output));
}

function writeResult(result, stdout, stderr) {
  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
}

/** Run one lockfile audit, retrying infrastructure failures but never findings. */
export async function runAuditTarget(
  target,
  {
    spawn = spawnSync,
    wait = sleep,
    retryDelays = RETRY_DELAYS_MS,
    stdout = process.stdout,
    stderr = process.stderr,
    exceptions = AUDIT_EXCEPTIONS,
    now = new Date(),
  } = {},
) {
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const result = spawn(target.command, target.args, {
      cwd: target.cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_fetch_retries: "0",
        npm_config_fetch_timeout: String(ATTEMPT_TIMEOUT_MS),
      },
      maxBuffer: MAX_OUTPUT_BYTES,
      shell: process.platform === "win32",
    });
    // A JSON report decides on its own: the audit's exit code also counts
    // moderate findings and advisories an exception covers.
    const advisories = result.error ? null : parseAuditAdvisories(result.stdout ?? "");
    if (advisories) {
      if (result.stderr) stderr.write(result.stderr);
      return reportAdvisories(advisories, { stdout, exceptions, now });
    }
    writeResult(result, stdout, stderr);

    if (result.status === 0) return AUDIT_RESULT.passed;

    const errorText = [
      result.error?.code,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n");
    const transient = isTransientAuditFailure(errorText);
    const canRetry = attempt < retryDelays.length && transient;

    if (!canRetry) {
      if (transient) return AUDIT_RESULT.unavailable;
      if (result.error) {
        stderr.write(`  ✗ ${target.command} cannot run: ${result.error.message}\n`);
      }
      return AUDIT_RESULT.failed;
    }

    const delay = retryDelays[attempt];
    stderr.write(
      `  ⚠ Audit registry unavailable; retrying ${target.label} in ${delay / 1_000}s ` +
        `(${attempt + 2}/${retryDelays.length + 1}).\n`,
    );
    await wait(delay);
  }

  return AUDIT_RESULT.failed;
}

function reportAdvisories(advisories, { stdout, exceptions, now }) {
  const { blocking, excepted } = classifyAdvisories(advisories, { exceptions, now });
  const lower = advisories.length - blocking.length - excepted.length;
  for (const advisory of blocking) {
    stdout.write(`  ✗ ${advisory.severity} ${advisory.package}: ${advisory.title} (${advisory.id})\n`);
  }
  for (const advisory of excepted) {
    stdout.write(
      `  ⚠ ${advisory.severity} ${advisory.package}: ${advisory.id} accepted until ${advisory.expires} ` +
        `(AUDIT_EXCEPTIONS in scripts/audit.mjs)\n`,
    );
  }
  if (lower > 0) stdout.write(`  ${lower} advisory(ies) below high, not blocking.\n`);
  if (blocking.length === 0) stdout.write("  No blocking advisory.\n");
  return blocking.length > 0 ? AUDIT_RESULT.failed : AUDIT_RESULT.passed;
}

export async function main({
  targets = AUDIT_TARGETS,
  runTarget = runAuditTarget,
  output = console,
  allowUnavailable = process.env.MINDDY_AUDIT_ALLOW_UNAVAILABLE === "true",
} = {}) {
  const failed = [];
  const unavailable = [];

  for (const target of targets) {
    output.log(`\n→ Audit ${target.label}`);
    const result = await runTarget(target);
    if (result === AUDIT_RESULT.failed) failed.push(target.label);
    if (result === AUDIT_RESULT.unavailable) unavailable.push(target.label);
  }

  if (failed.length > 0) {
    output.error(`\n✗ Audit: high/critical vulnerability or audit command failure in:`);
    for (const label of failed) output.error(`    - ${label}`);
    return 1;
  }

  if (unavailable.length > 0) {
    const write = allowUnavailable ? output.warn.bind(output) : output.error.bind(output);
    write(`\n${allowUnavailable ? "⚠" : "✗"} Audit registry unavailable after retries for:`);
    for (const label of unavailable) write(`    - ${label}`);
    if (allowUnavailable) {
      write("  CI dependency review remains authoritative for pull-request changes.");
      return 0;
    }
    write("  These executable dependency trees could not be verified.");
    return 2;
  }

  output.log("\n✓ Audit: no blocking high/critical vulnerability.");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await main();
}
