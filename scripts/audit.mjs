#!/usr/bin/env node
/**
 * The repository "vulnerabilities" gate (MIN-335) — a single definition, read by
 * the CI ([.github/workflows/ci.yml]) as by [deploy.sh].
 *
 * It fixes two blind spots of the old `npm audit --omit=dev` :
 *
 * 1. **The correct lockfile.** The repository holds three: `pnpm-lock.yaml` (the one that
 * actually installs — `node_modules` is a pnpm store), `package-lock.json`
 * (held second, cf. CLAUDE.md), and `desktop/package-lock.json` (the
 * macOS app, never audited until now). A hundred packages resolve
 * differently between the first two: auditing `package-lock.json` alone,
 * was auditing a tree that no one executes. We audit them all
 * three — each one can be installed by someone.
 *
 * 2. **`--omit=dev` hid the build chain.** The reasoning ("the build tools
 * are not exposed in prod") does not hold: `esbuild` produces
 * the bundles actually delivered (agent VM, page projection, shell
 * macOS) and `tailwindcss` produces the CSS served to visitors. A compromised
 * packet in this chain does not need to be in `dependencies` for
 * to end up in whatever the user is executing. We therefore audit the ENTIRE tree.
 *
 * Threshold: `high`. A high or critical vuln causes the process to fail.
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

/** The three lockfiles in the repository, and the command that can read each one. */
const TARGETS = [
  {
    label: "root — pnpm-lock.yaml (the actually installed tree)",
    cwd: ROOT,
    command: "pnpm",
    args: ["audit", "--audit-level=high"],
  },
  {
    label: "root — package-lock.json (secondary lockfile)",
    cwd: ROOT,
    command: "npm",
    args: ["audit", "--audit-level=high"],
  },
  {
    label: "desktop — package-lock.json (macOS shell)",
    cwd: path.join(ROOT, "desktop"),
    command: "npm",
    args: ["audit", "--audit-level=high"],
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
    writeResult(result, stdout, stderr);

    if (result.status === 0) return true;

    const errorText = [
      result.error?.code,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n");
    const canRetry = attempt < retryDelays.length && isTransientAuditFailure(errorText);

    if (!canRetry) {
      if (result.error) {
        stderr.write(`  ✗ ${target.command} cannot run: ${result.error.message}\n`);
      }
      return false;
    }

    const delay = retryDelays[attempt];
    stderr.write(
      `  ⚠ Audit registry unavailable; retrying ${target.label} in ${delay / 1_000}s ` +
        `(${attempt + 2}/${retryDelays.length + 1}).\n`,
    );
    await wait(delay);
  }

  return false;
}

export async function main() {
  const failed = [];

  for (const target of TARGETS) {
    console.log(`\n→ Audit ${target.label}`);
    if (!(await runAuditTarget(target))) failed.push(target.label);
  }

  if (failed.length > 0) {
    console.error(`\n✗ Audit: high/critical vulnerability (or audit unavailable) in:`);
    for (const label of failed) console.error(`    - ${label}`);
    return 1;
  }

  console.log("\n✓ Audit: no high/critical vulnerabilities in the three lockfiles.");
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  process.exitCode = await main();
}
