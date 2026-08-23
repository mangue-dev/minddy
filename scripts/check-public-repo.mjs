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
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { createHash } from "node:crypto";

const staged = process.argv.includes("--staged");
const worktree = process.argv.includes("--worktree");
const remoteFlag = process.argv.indexOf("--remote");
const remoteName = remoteFlag === -1 ? null : process.argv[remoteFlag + 1];
if (remoteFlag !== -1 && (!remoteName || remoteName.startsWith("-"))) {
  throw new Error("--remote requires the name of a configured Git remote");
}
if ([staged, worktree, Boolean(remoteName)].filter(Boolean).length > 1) {
  throw new Error("--staged, --worktree and --remote are mutually exclusive");
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

let repository = process.cwd();

function redactRemoteUrl(value) {
  return value.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@");
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function checkedGit(args, input) {
  const result = spawnSync("git", args, {
    cwd: repository,
    input,
    encoding: null,
    maxBuffer: 512 * 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" },
  });
  if (result.status !== 0) {
    throw new Error(redactRemoteUrl(result.stderr?.toString("utf8") || `git ${args.join(" ")} failed`));
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
function refInventory(includeAllRefs) {
  const prefixes = includeAllRefs
    ? ["refs"]
    : ["refs/heads", "refs/tags", "refs/remotes/origin", "refs/pull", "refs/replace", "refs/notes"];
  return git(["for-each-ref", "--format=%(refname)%00%(objectname)%00%(objecttype)", ...prefixes])
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, object, type] = line.split("\0");
      return { name, object, type };
    });
}

function scanReachableHistory(failures, includeAllRefs = false) {
  const refs = refInventory(includeAllRefs);
  const entries = checkedGit(["rev-list", "--objects", "--stdin"], `${refs.map(({ object }) => object).join("\n")}\n`)
    .toString("utf8")
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
  const blobs = metadata
    .map((line) => line.split(" "))
    .filter(([, type]) => type === "blob")
    .map(([id, , rawSize]) => ({ id, size: Number(rawSize) }));
  if (blobs.length === 0) return { refs, objects: objectIds.length, blobs: 0 };

  const batches = [];
  let current = [];
  let currentSize = 0;
  for (const blob of blobs) {
    if (current.length > 0 && currentSize + blob.size > 64 * 1024 * 1024) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(blob.id);
    currentSize += blob.size;
  }
  if (current.length > 0) batches.push(current);

  for (const ids of batches) {
    const batch = checkedGit(["cat-file", "--batch"], `${ids.join("\n")}\n`);
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
      scanText(
        pathByObject.get(id) ?? "<unknown historical path>",
        body.toString("utf8"),
        failures,
        "history ",
      );
    }
  }
  return { refs, objects: objectIds.length, blobs: blobs.length };
}

function scanUnexpectedObjects(failures) {
  const output = git(["fsck", "--no-reflogs", "--unreachable", "--no-dangling"]);
  const count = output.split("\n").filter((line) => line.startsWith("unreachable ")).length;
  if (count > 0) failures.push(`${count} unreachable object(s) retained in the scanned repository`);
  return count;
}

function scanRemote(remote) {
  const remoteUrl = git(["remote", "get-url", remote]).trim();
  const temporaryRoot = mkdtempSync(join(tmpdir(), "minddy-public-repository-"));
  const mirror = join(temporaryRoot, "repository.git");
  try {
    // A mirror avoids trusting the caller's remote-tracking configuration.
    // GitHub does not advertise pull-request refs by default, so fetch their
    // two documented namespaces explicitly before scanning every mirror ref.
    checkedGit(["clone", "--mirror", "--no-local", remoteUrl, mirror]);
    repository = mirror;
    checkedGit(["fetch", "--prune", "origin", "+refs/pull/*/head:refs/pull/*/head", "+refs/pull/*/merge:refs/pull/*/merge", "+refs/replace/*:refs/replace/*", "+refs/notes/*:refs/notes/*"]);
    const failures = [];
    const history = scanReachableHistory(failures, true);
    const unreachable = scanUnexpectedObjects(failures);
    return { failures, history, unreachable };
  } finally {
    repository = process.cwd();
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

if (remoteName) {
  const { failures, history, unreachable } = scanRemote(remoteName);
  const fingerprint = createHash("sha256")
    .update(history.refs.map(({ name, object, type }) => `${name}\0${object}\0${type}\n`).sort().join(""))
    .digest("hex");
  const summary = `${history.refs.length} refs, ${history.blobs} blobs in ${history.objects} reachable Git objects, ${unreachable} unreachable objects, ref inventory SHA-256 ${fingerprint}`;
  if (failures.length) {
    console.error("The remote public namespace cannot contain:");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(`Remote inventory: ${summary}.`);
    process.exit(1);
  }
  console.log(`Remote public namespace check passed (${summary}).`);
  process.exit(0);
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
