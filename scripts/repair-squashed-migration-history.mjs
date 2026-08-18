#!/usr/bin/env node
/**
 * MIN-379 — safe transition from existing instances to the compact baseline.
 *
 * The baseline voluntarily carries the latest version of the old history.
 * An instance already up to date therefore has its correct schema; only the 210 old
 * records in `supabase_migrations.schema_migrations` should be removed. This command never touches the schema or data.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export const BASELINE_VERSION = "20270106090000";
export const LEGACY_VERSION_COUNT = 210;
// SHA-256 of the sorted list of 211 pre-baseline versions, one per line.
// It's more compact than a second copy of the old history, while
// preventing you from repairing a database that only has a similar number of versions.
export const LEGACY_HISTORY_DIGEST = "8c79c3a1afa368b63956b311fec45ec81dd9649764d27a49db9a61894c43682b";

function fail(message) {
  throw new Error(`History repair failed: ${message}`);
}

export function parseArgs(argv) {
  const options = { apply: false, linked: false, manualSchema: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--db-url") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--db-url expects a value.");
      options.dbUrl = value;
    } else if (flag === "--apply") {
      options.apply = true;
    } else if (flag === "--linked") {
      options.linked = true;
    } else if (flag === "--allow-manual-schema") {
      options.manualSchema = true;
    } else if (flag === "--confirm-history") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) fail("--confirm-history expects a SHA-256 digest.");
      options.confirmHistory = value;
    } else if (flag === "--help" || flag === "-h") {
      options.help = true;
    } else {
      fail(`unknown option: ${flag}.`);
    }
  }
  if (!options.help && !options.dbUrl && !options.linked) {
    fail("--db-url or --linked is required.");
  }
  if (options.dbUrl && options.linked) fail("--db-url and --linked are mutually exclusive.");
  return options;
}

export function help() {
  return `Usage: pnpm repair:squashed-migrations -- (--db-url <postgres-url> | --linked) [options]

Without --apply, only verifies that the instance has exactly the 211 versions
from the old history. With --apply, removes the 210 versions before baseline
20270106090000 from the history table; the schema and data are never modified.
--linked uses the project linked to the CLI.
For a database whose migrations were applied manually, first inspect the schema
with \`supabase db diff --linked\`, then add \`--allow-manual-schema\`. With
\`--apply\`, this path also requires \`--confirm-history <displayed-digest>\`.
Create a restorable backup first.`;
}

function command(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error?.code === "ENOENT") fail(`command is missing: ${command}.`);
  if (result.status !== 0) fail(`${command} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

export function linkedVersions(output) {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*[^|]*\|\s*(\d{14})\s*\|/.exec(line)?.[1])
    .filter(Boolean);
}

function listRemoteVersions(options) {
  if (options.linked) {
    return linkedVersions(command("supabase", ["migration", "list", "--linked"]));
  }
  return command("psql", [
    options.dbUrl,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-c",
    "select version from supabase_migrations.schema_migrations order by version",
  ])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function summariseHistory(versions) {
  const unique = [...new Set(versions)].sort();
  const malformed = unique.filter((version) => !/^\d{14}$/.test(version));
  const newer = unique.filter((version) => version > BASELINE_VERSION);
  const legacy = unique.filter((version) => version < BASELINE_VERSION);
  return {
    hasBaseline: unique.includes(BASELINE_VERSION),
    malformed,
    newer,
    legacy,
    ready:
      unique.length === LEGACY_VERSION_COUNT + 1 &&
      legacy.length === LEGACY_VERSION_COUNT &&
      createHash("sha256").update(`${unique.join("\n")}\n`).digest("hex") === LEGACY_HISTORY_DIGEST,
  };
}

function historyDigest(versions) {
  return createHash("sha256").update(`${[...new Set(versions)].sort().join("\n")}\n`).digest("hex");
}

export function validateHistory(versions) {
  const summary = summariseHistory(versions);
  if (!summary.hasBaseline) fail(`baseline ${BASELINE_VERSION} is not recorded.`);
  if (summary.malformed.length > 0) fail(`unexpected versions: ${summary.malformed.join(", ")}.`);
  if (summary.newer.length > 0) fail(`migrations after baseline: ${summary.newer.join(", ")}.`);
  if (!summary.ready) {
    fail(
      `the instance does not have exactly the expected history: ${summary.legacy.length} version(s) ` +
        `before baseline, ${LEGACY_VERSION_COUNT} expected. Check for drift before repairing.`
    );
  }
  return summary;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }
  const versions = listRemoteVersions(options);
  let summary;
  let manualSchema = false;
  try {
    summary = validateHistory(versions);
  } catch (error) {
    if (!options.manualSchema) throw error;
    summary = summariseHistory(versions);
    if (summary.malformed.length > 0 || summary.newer.length > 0) {
      throw error;
    }
    manualSchema = true;
    console.log(
      `→ Manual history accepted: ${summary.legacy.length} version(s), digest ${historyDigest(versions)}.`
    );
  }
  if (!manualSchema) {
    console.log(`→ Instance verified: baseline + ${summary.legacy.length} historical versions.`);
  }
  if (!options.apply) {
    console.log(
      manualSchema
        ? "→ Simulation only. Check the schema diff, then add --apply --confirm-history <digest>."
        : "→ Simulation only. Add --apply after creating a restorable backup to repair history."
    );
    return;
  }
  if (manualSchema && options.confirmHistory !== historyDigest(versions)) {
    fail("--confirm-history must exactly match the digest displayed by the simulation.");
  }

  const repairArgs = [
    "migration",
    "repair",
    "--status",
    "reverted",
    ...summary.legacy,
    "--yes",
  ];
  if (options.linked) repairArgs.splice(2, 0, "--linked");
  else repairArgs.splice(2, 0, "--db-url", options.dbUrl);
  command("supabase", repairArgs);
  if (!summary.hasBaseline) {
    const applyArgs = ["migration", "repair", "--status", "applied", BASELINE_VERSION, "--yes"];
    if (options.linked) applyArgs.splice(2, 0, "--linked");
    else applyArgs.splice(2, 0, "--db-url", options.dbUrl);
    command("supabase", applyArgs);
  }
  const remaining = listRemoteVersions(options);
  if (remaining.length !== 1 || remaining[0] !== BASELINE_VERSION) {
    fail("history after repair does not contain only the baseline; cancel the deployment.");
  }
  console.log("✓ History consolidated. Run pnpm bootstrap:supabase now to apply the initial data migration.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
