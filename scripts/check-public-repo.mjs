#!/usr/bin/env node

/**
 * Publication barrier: This repository is intended to become public. The local
 * paths and internal documents below should therefore never be followed.
 *
 * Without option, the check reads the entire index (CI). With `--staged`, it only
 * reads additions and modifications ready to be committed, for a local hook.
 * `--worktree` applies the same rules to files not yet indexed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const staged = process.argv.includes("--staged");
const worktree = process.argv.includes("--worktree");
if (staged && worktree) {
  throw new Error("--staged and --worktree are incompatible");
}
const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".sh", ".ts", ".tsx", ".txt", ".yml", ".yaml"]);
const fixturePath = /(?:^|\/)(?:fixtures?|__tests__)(?:\/|$)|\.test\.[cm]?[jt]sx?$/;
// Artifacts that should never reach a publishable ref, including in
// its history: these are secrets, local data or internal documents.
const historicalForbiddenPaths = [
  /^\.claude\/settings\.json$/,
  /^\.claude\/launch\.json$/,
  /^captures\/world\/world\.md$/,
  /^dev\.log$/,
  /^problems\.md$/,
  /^tsconfig\.tsbuildinfo$/,
  /^copy-audit.*\.(?:json|md)$/,
  /^[^/]+-plan\.md$/,
  /^desktop\/dist\//,
  /^docs\/audits\/securite-2026-08-05\.md$/,
  /^docs\/desktop-signing\.md$/,
  /^docs\/rgpd\/registre-des-traitements\.md$/,
];

// Surfaces specific to the Minddy Cloud operation. They are controlled in
// the index: the administration of ONE instance, the financial dashboard and the
// deployment tools remain public and self-hosted capabilities.
const privateSurfacePaths = [
  /^app\/api\/cron\/spend-guard\/route\.ts$/,
  /^app\/api\/webhooks\/supabase\/new-user\/route\.ts$/,
  /^supabase\/migrations\/20260910090000_auth_new_user_webhook\.sql$/,
  /^app\/feedback\/route\.ts$/,
  /^lib\/server\/brrr\./,
  /^lib\/open-feedback-board\./,
  /^scripts\/(?:backfill-feedback-team-language|check-background-jobs|create-agent-snapshot|drop-avatars-bucket|extract-apns-secret|indexnow|security-probe|seed-inbox)\./,
];

const forbiddenContent = [
  {
    label: "private key",
    matches: (_path, text) => /-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----/.test(text),
  },
  {
    label: "GitHub token",
    matches: (_path, text) => /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text),
  },
  {
    label: "OpenAI API key",
    matches: (_path, text) => [...text.matchAll(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g)]
      .some((match) => !match[0].includes("PLACEHOLDER")),
  },
  {
    label: "Anthropic API key",
    matches: (_path, text) => /\bsk-ant-[A-Za-z0-9_-]{20,}\b/.test(text),
  },
  {
    label: "Slack token",
    matches: (_path, text) => /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/.test(text),
  },
  {
    label: "AWS key identifier",
    matches: (_path, text) => /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text),
  },
  {
    label: "Google API key",
    matches: (_path, text) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(text),
  },
];

// These markers describe the Cloud operator's tools, not a capacity
// instance administration. They are checked in the current content but
// not in the history: this may still contain the retired version.
const privateSurfaceContent = [
  {
    label: "brrr operations alert",
    matches: (_path, text) => /\bBRRR_WEBHOOK_URL\b|api\.brrr\.now/.test(text),
  },
];

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function checkedGit(args, input) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    input,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr?.toString("utf8") || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function scanText(path, text, failures, prefix = "") {
  // The old APNs converter is removed from the public core by MIN-374. Her
  // historical code intentionally contains PEM delimiters, not a key;
  // it must not hide the scanning of other reachable blobs.
  if (fixturePath.test(path) || (prefix && path === "scripts/extract-apns-secret.mjs")) return;
  for (const rule of forbiddenContent) {
    if (rule.matches(path, text)) failures.push(`${prefix}${path}: ${rule.label}`);
  }
  if (!prefix) {
    for (const rule of privateSurfaceContent) {
      if (rule.matches(path, text)) failures.push(`${path}: ${rule.label}`);
    }
  }
}

/**
 * Analyzes each blob reachable from a publishable ref (branches, tags and
 * refs `origin/*`). This detects a secret removed from HEAD but still present
 * in a commit that would be made public. Local tooling private refs
 * (e.g. `refs/codex/*`) are not part of a standard push and should not cause the post to fail. Inaccessible objects are not pushed by Git: the purge procedure is documented in the audit.
 */
function scanReachableHistory(failures) {
  const entries = git(["rev-list", "--objects", "--branches", "--tags", "--remotes=origin"])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(" ");
      return separator === -1 ? [line, "<Git object without path>"] : [line.slice(0, separator), line.slice(separator + 1)];
    });
  const pathByObject = new Map(entries);
  for (const path of new Set(pathByObject.values())) {
    if (historicalForbiddenPaths.some((pattern) => pattern.test(path))) {
      failures.push(`history ${path}: internal path is forbidden`);
    }
  }
  const objectIds = [...pathByObject.keys()];
  const metadata = checkedGit(["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], `${objectIds.join("\n")}\n`)
    .toString("utf8")
    .trim()
    .split("\n");
  const blobIds = metadata
    .map((line) => line.split(" "))
    .filter(([, type]) => type === "blob")
    .map(([id]) => id);
  const batch = checkedGit(["cat-file", "--batch"], `${blobIds.join("\n")}\n`);
  let offset = 0;

  while (offset < batch.length) {
    const lineEnd = batch.indexOf(0x0a, offset);
    if (lineEnd === -1) throw new Error("incomplete response from git cat-file --batch");
    const [id, type, rawSize] = batch.subarray(offset, lineEnd).toString("utf8").split(" ");
    const size = Number(rawSize);
    offset = lineEnd + 1;
    if (type !== "blob" || !Number.isSafeInteger(size) || offset + size > batch.length) {
      throw new Error(`invalid response from git cat-file for ${id}`);
    }
    const body = batch.subarray(offset, offset + size);
    offset += size + 1; // git adds a newline after each blob.
    if (body.includes(0x00) || size > 5 * 1024 * 1024) continue;
    scanText(pathByObject.get(id) ?? "<unknown historical path>", body.toString("utf8"), failures, "history ");
  }
  return { objects: objectIds.length, blobs: blobIds.length };
}

const rawPaths = staged
  ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"])
  : worktree
    ? git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    : git(["ls-files", "-z"]);
const paths = rawPaths.split("\0").filter((path) => !worktree || existsSync(path));
const failures = [];

for (const path of paths) {
  if ([...historicalForbiddenPaths, ...privateSurfacePaths].some((pattern) => pattern.test(path))) {
    failures.push(`${path}: internal path is forbidden`);
    continue;
  }

  // Content rules target sources and documents. Read the captures
  // binaries would be slow, unnecessary, and may overrun Node's buffer.
  if (!textExtensions.has(extname(path))) {
    continue;
  }

  // The index is the content published by the CI as well as that which will be committed by
  // a local hook; never reread HEAD, which may still contain a file
  // which we have just removed. `--worktree` is used to check the diff
  // local before adding it to the index.
  const text = worktree ? readFileSync(path, "utf8") : git(["show", `:${path}`]);

  scanText(path, text, failures);
}

const history = staged ? null : scanReachableHistory(failures);

if (failures.length) {
  console.error("The public repository cannot contain:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public repository check passed (${paths.length} files${staged ? " staged" : worktree ? " in the worktree" : " tracked"}${history ? `, ${history.blobs} blobs in ${history.objects} reachable Git objects` : ""}).`);
