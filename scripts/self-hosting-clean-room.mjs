#!/usr/bin/env node
/**
 * MIN-383 — preflight and evidence recorder for a clean-room self-hosting run.
 *
 * The destructive installation, backup, upgrade, and restore commands remain in
 * docs/self-hosting-clean-room.md. This program proves that the selected inputs
 * are immutable releases containing that contract before an operator creates a
 * disposable stack. It never reads .env files and redacts command diagnostics.
 */
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(SCRIPT_DIR, "..");
export const REQUIRED_RELEASE_PATHS = [
  "docs/self-hosting.md",
  "docs/self-hosting-operations.md",
  "docs/self-hosting-clean-room.md",
  "scripts/bootstrap-supabase.mjs",
  "scripts/export-managed-policies.sql",
  "scripts/verify-supabase-bootstrap.mjs",
  "scripts/fetch-official-supabase.mjs",
  "scripts/smoke-self-hosted-compose.mjs",
  "scripts/validate-self-hosted-compose.mjs",
  "deploy/self-hosted/compose.managed.yml",
  "deploy/self-hosted/compose.full.yml",
  "deploy/self-hosted/Caddyfile",
  "deploy/self-hosted/Caddyfile.full",
  "deploy/self-hosted/scheduler.mjs",
  "deploy/self-hosted/.env.example",
  "deploy/self-hosted/compatibility.json",
  "supabase/config.toml",
  "supabase/migrations",
];

const SECRET_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|DB_URL)$/i;
const CLOUD_OPT_INS = [
  "MINDDY_EDITION",
  "MINDDY_MANAGED_AI",
  "MINDDY_MANAGED_BILLING",
  "AGENT_EXECUTION_BACKEND",
  "MINDDY_PUBLIC_VERCEL_ANALYTICS",
  "MINDDY_PUBLIC_POSTHOG_KEY",
  "POSTHOG_API_KEY",
  "STRIPE_SECRET_KEY",
  "RESEND_API_KEY",
];

export function parseArgs(argv) {
  const options = { report: null, checkEnvironment: true, mode: "release" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith("--")) throw new Error(`${arg} expects a value.`);
      return next;
    };
    if (arg === "--") continue;
    if (arg === "--from-tag") options.fromTag = value();
    else if (arg === "--to-tag") options.toTag = value();
    else if (arg === "--from-ref") options.fromRef = value();
    else if (arg === "--to-ref") options.toRef = value();
    else if (arg === "--prepublication") options.mode = "prepublication";
    else if (arg === "--report") options.report = resolve(value());
    else if (arg === "--skip-environment-check") options.checkEnvironment = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`unknown option: ${arg}. See --help.`);
  }
  if (!options.help && options.mode === "release" && (options.fromRef || options.toRef)) {
    throw new Error("--from-ref and --to-ref require --prepublication.");
  }
  if (!options.help && options.mode === "prepublication" && (options.fromTag || options.toTag)) {
    throw new Error("use candidate refs, not release tags, with --prepublication.");
  }
  if (!options.help && options.mode === "release" && (!options.fromTag || !options.toTag)) {
    throw new Error("--from-tag and --to-tag are required for release validation.");
  }
  if (!options.help && options.mode === "prepublication" && (!options.fromRef || !options.toRef)) {
    throw new Error("--from-ref and --to-ref are required for prepublication validation.");
  }
  return options;
}

export function help() {
  return `Usage:
  pnpm validate:self-hosted -- --from-tag vX.Y.Z --to-tag vX.Y.Z [options]
  pnpm validate:self-hosted -- --prepublication \\
    --from-ref preflight/vX.Y.Z --to-ref preflight/vX.Y.Z [options]

Options:
  --prepublication            Validate annotated preflight refs before publication.
  --from-ref <ref>            Source candidate ref named preflight/vMAJOR.MINOR.PATCH.
  --to-ref <ref>              Target candidate ref named preflight/vMAJOR.MINOR.PATCH.
  --report <path>             Write a sanitized Markdown preflight report.
  --skip-environment-check    Do not reject optional/cloud variables in the shell.
  -h, --help                  Show this help.

Run this command from a clone containing the two fetched annotated refs.
After it passes, execute docs/self-hosting-clean-room.md in a disposable host.`;
}

export function redactSecrets(text, env = process.env) {
  let redacted = String(text);
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < 6 || !SECRET_NAME.test(name)) continue;
    redacted = redacted.split(value).join(`[redacted:${name}]`);
  }
  return redacted
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[redacted]@")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]");
}

export function releaseVersion(tag) {
  const match = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(tag);
  if (!match) throw new Error(`${tag} is not a vMAJOR.MINOR.PATCH release tag.`);
  return match.slice(1).map(Number);
}

export function candidateVersion(ref) {
  const match = /^preflight\/(v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(ref);
  if (!match) throw new Error(`${ref} is not a preflight/vMAJOR.MINOR.PATCH candidate ref.`);
  releaseVersion(match[1]);
  return match[1];
}

export function assertConsecutiveVersions(fromTag, toTag) {
  const from = releaseVersion(fromTag);
  const to = releaseVersion(toTag);
  const valid =
    (to[0] === from[0] && to[1] === from[1] && to[2] === from[2] + 1) ||
    (to[0] === from[0] && to[1] === from[1] + 1 && to[2] === 0) ||
    (to[0] === from[0] + 1 && to[1] === 0 && to[2] === 0);
  if (!valid) throw new Error(`${fromTag} and ${toTag} are not consecutive SemVer releases.`);
}

export function cloudEnvironmentFindings(env = process.env) {
  return CLOUD_OPT_INS.filter((name) => {
    const value = env[name]?.trim();
    if (!value) return false;
    if (name === "MINDDY_EDITION") return value === "cloud";
    if (name === "AGENT_EXECUTION_BACKEND") return value !== "local";
    return value !== "0" && value.toLowerCase() !== "false";
  });
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: ROOT_DIR, encoding: "utf8" });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(redactSecrets((result.stderr || result.stdout || "git failed").trim()));
  }
  return { ok: result.status === 0, output: result.stdout.trim() };
}

export function inspectRelease(ref, versionTag = ref) {
  releaseVersion(versionTag);
  const objectType = git(["cat-file", "-t", ref]).output;
  const tagObject = git(["rev-parse", ref]).output;
  const commit = git(["rev-parse", `${ref}^{commit}`]).output;
  const missingPaths = REQUIRED_RELEASE_PATHS.filter(
    (path) => !git(["cat-file", "-e", `${ref}:${path}`], { allowFailure: true }).ok
  );
  const packageText = git(["show", `${ref}:package.json`]).output;
  let packageVersion;
  try {
    packageVersion = JSON.parse(packageText).version;
  } catch {
    throw new Error(`${ref}:package.json is not valid JSON.`);
  }
  if (`v${packageVersion}` !== versionTag) {
    throw new Error(`${ref} declares ${versionTag} but package.json has version ${packageVersion}.`);
  }
  return { tag: versionTag, ref, tagObject, commit, packageVersion, annotated: objectType === "tag", missingPaths };
}

export function buildReport({ from, to, ancestor, environmentFindings, generatedAt, mode = "release" }) {
  const missing = [
    ...from.missingPaths.map((path) => `${from.ref ?? from.tag}:${path}`),
    ...to.missingPaths.map((path) => `${to.ref ?? to.tag}:${path}`),
  ];
  const passed = from.annotated && to.annotated && ancestor && missing.length === 0 && environmentFindings.length === 0;
  const annotatedKind = mode === "prepublication" ? "annotated candidate tags" : "annotated release tags";
  const checklist = [
    [from.annotated, `${from.ref ?? from.tag} is an annotated tag`],
    [to.annotated, `${to.ref ?? to.tag} is an annotated tag`],
    [from.missingPaths.length === 0, `${from.ref ?? from.tag} contains the clean-room contract`],
    [to.missingPaths.length === 0, `${to.ref ?? to.tag} contains the clean-room contract`],
    [ancestor, `${from.ref ?? from.tag} is an ancestor of ${to.ref ?? to.tag}`],
    [environmentFindings.length === 0, "the invoking shell has no optional Minddy Cloud service enabled"],
  ];
  return `# Self-hosting clean-room preflight — ${from.tag} to ${to.tag}

- Generated: ${generatedAt}
- Result: **${passed ? "PASS" : "BLOCKED"}**
- Validation mode: ${mode === "prepublication" ? "prepublication candidates" : "published releases"}
- Source ref: \`${from.ref ?? from.tag}\`
- Source package version: \`${from.packageVersion ?? from.tag.slice(1)}\`
- Source tag object: \`${from.tagObject ?? "not recorded"}\`
- Source commit: \`${from.commit}\`
- Target ref: \`${to.ref ?? to.tag}\`
- Target package version: \`${to.packageVersion ?? to.tag.slice(1)}\`
- Target tag object: \`${to.tagObject ?? "not recorded"}\`
- Target commit: \`${to.commit}\`

${checklist.map(([ok, label]) => `- [${ok ? "x" : " "}] ${label}`).join("\n")}

## Blocking findings

${!from.annotated || !to.annotated ? `- ${[!from.annotated && (from.ref ?? from.tag), !to.annotated && (to.ref ?? to.tag)].filter(Boolean).join(" and ")} ${!from.annotated && !to.annotated ? "are lightweight tags" : "is a lightweight tag"}, not ${!from.annotated && !to.annotated ? annotatedKind : `an ${annotatedKind.slice(0, -1)}`}.\n` : ""}${missing.length > 0 ? missing.map((item) => `- Missing \`${item}\`.`).join("\n") : from.annotated && to.annotated ? "- None." : ""}
${environmentFindings.length > 0 ? `\n${environmentFindings.map((name) => `- \`${name}\` is enabled in the invoking shell; use a clean shell.`).join("\n")}` : ""}

## Lifecycle evidence

Complete the commands and evidence table in \`docs/self-hosting-clean-room.md\` only after this preflight passes. A blocked preflight is not evidence that installation, update, or restoration succeeded.${mode === "prepublication" ? ` After the lifecycle passes, publish \`${from.tag}\` and \`${to.tag}\` only at the source and target commits recorded above; any changed commit requires a new clean-room run.` : ""}
`;
}

export function runPreflight(options, env = process.env) {
  const fromRef = options.mode === "prepublication" ? options.fromRef : options.fromTag;
  const toRef = options.mode === "prepublication" ? options.toRef : options.toTag;
  const fromTag = options.mode === "prepublication" ? candidateVersion(fromRef) : fromRef;
  const toTag = options.mode === "prepublication" ? candidateVersion(toRef) : toRef;
  assertConsecutiveVersions(fromTag, toTag);
  const from = inspectRelease(fromRef, fromTag);
  const to = inspectRelease(toRef, toTag);
  const ancestor = git(["merge-base", "--is-ancestor", fromRef, toRef], { allowFailure: true }).ok;
  const environmentFindings = options.checkEnvironment ? cloudEnvironmentFindings(env) : [];
  const report = buildReport({ from, to, ancestor, environmentFindings, generatedAt: new Date().toISOString(), mode: options.mode });
  const passed = from.annotated && to.annotated && ancestor && from.missingPaths.length === 0 && to.missingPaths.length === 0 && environmentFindings.length === 0;
  return { passed, from, to, ancestor, environmentFindings, report };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }
  const result = runPreflight(options);
  if (options.report) {
    mkdirSync(dirname(options.report), { recursive: true });
    writeFileSync(options.report, result.report, { mode: 0o644 });
    console.log(`Clean-room preflight report: ${options.report}`);
  } else {
    console.log(result.report);
  }
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`Self-hosting clean-room preflight failed: ${redactSecrets(error instanceof Error ? error.message : error)}`);
    process.exitCode = 1;
  }
}
