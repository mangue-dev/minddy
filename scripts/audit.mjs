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
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const failed = [];

for (const target of TARGETS) {
  console.log(`\n→ Audit ${target.label}`);
  const result = spawnSync(target.command, target.args, {
    cwd: target.cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  // A command not found (pnpm missing from the machine) is a gate failure,
  // not a silent success: better to block than to believe you have audited.
  if (result.error) {
    console.error(`  ✗ ${target.command} cannot run: ${result.error.message}`);
    failed.push(target.label);
    continue;
  }

  if (result.status !== 0) {
    failed.push(target.label);
  }
}

if (failed.length > 0) {
    console.error(`\n✗ Audit: high/critical vulnerability (or audit unavailable) in:`);
  for (const label of failed) console.error(`    - ${label}`);
  process.exit(1);
}

console.log("\n✓ Audit: no high/critical vulnerabilities in the three lockfiles.");
