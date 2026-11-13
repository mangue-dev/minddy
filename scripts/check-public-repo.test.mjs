import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-public-repo.mjs");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commit(cwd, message) {
  git(cwd, ["add", "."]);
  git(cwd, ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]).trim();
}

function runRemoteCheck(cwd) {
  return spawnSync(process.execPath, [script, "--remote", "origin"], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function runStagedCheck(cwd) {
  return spawnSync(process.execPath, [script, "--staged"], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
  });
}

test("staged check accepts the mobile shell's sources and rejects its build output", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  try {
    git(root, ["init", "--initial-branch=main"]);
    mkdirSync(join(root, "mobile", "ios", "App", "App", "public"), { recursive: true });
    mkdirSync(join(root, "mobile", "www"));
    writeFileSync(join(root, "mobile", "capacitor.config.ts"), "export default {};\n");
    writeFileSync(join(root, "mobile", "ios", "App", "App", "AppDelegate.swift"), "import UIKit\n");
    git(root, ["add", "mobile"]);

    const accepted = runStagedCheck(root);
    assert.equal(accepted.status, 0, accepted.stderr);

    writeFileSync(join(root, "mobile", "www", "shell.js"), "// Generated bundle.\n");
    writeFileSync(join(root, "mobile", "ios", "App", "App", "public", "shell.js"), "// Copied bundle.\n");
    git(root, ["add", "mobile"]);

    const rejected = runStagedCheck(root);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /mobile\/www\/shell\.js: internal path is forbidden/);
    assert.match(rejected.stderr, /mobile\/ios\/App\/App\/public\/shell\.js: internal path is forbidden/);
    assert.doesNotMatch(rejected.stderr, /AppDelegate\.swift/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("staged check allows the public security probe but rejects cloud-only scripts", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  try {
    git(root, ["init", "--initial-branch=main"]);
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts", "security-probe.mjs"), "// Public fixture-driven authorization probe.\n");
    git(root, ["add", "scripts/security-probe.mjs"]);

    const accepted = runStagedCheck(root);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /Public repository check passed/);

    writeFileSync(join(root, "scripts", "check-background-jobs.mjs"), "// Cloud operator tool.\n");
    git(root, ["add", "scripts/check-background-jobs.mjs"]);

    const rejected = runStagedCheck(root);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /scripts\/check-background-jobs\.mjs: internal path is forbidden/);
    assert.doesNotMatch(rejected.stderr, /scripts\/security-probe\.mjs/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("tracked working material fails the index check but not history or a staged commit", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  const files = {
    "docs/architecture/overview.md": "# Durable reference\n",
    "public/documentation/en/issues-workflow.png": "figure",
    "captures/shots/hero-board/out/pt-BR-dark.png": "master",
    "docs/validation/min-1-report.md": "# Ticket report\n",
    "docs/security/diagram.png": "debug",
    "content/documentation/reviews/min-1.json": "{}\n",
    "scripts/performance/measure.mjs": "// One-off benchmark.\n",
    "captures/shots/hero-board/out/min-1-before-light.png": "screenshot",
    "output/pr/board-light.png": "screenshot",
    ".deepsec/data/minddy/revalidation/run/invocation-000.json": "{}\n",
  };
  const rejected = Object.keys(files).slice(3);
  try {
    git(root, ["init", "--initial-branch=main"]);
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    git(root, ["add", "."]);
    const staged = runStagedCheck(root);
    assert.equal(staged.status, 0, staged.stderr);

    commit(root, "pull request screenshots and reports");
    const tracked = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(tracked.status, 1);
    for (const path of rejected) assert.match(tracked.stderr, new RegExp(`${path.replaceAll(".", "\\.")}: working material`));
    for (const path of Object.keys(files).slice(0, 3)) assert.doesNotMatch(tracked.stderr, new RegExp(path.replaceAll(".", "\\.")));

    git(root, ["rm", "-q", ...rejected]);
    commit(root, "remove working material");
    const cleaned = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", timeout: 30_000 });
    assert.equal(cleaned.status, 0, cleaned.stderr);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("remote check scans pull-request refs unavailable from the ordinary fetch", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  const source = join(root, "source");
  const remote = join(root, "remote.git");
  try {
    git(root, ["init", "--initial-branch=main", source]);
    writeFileSync(join(source, "README.md"), "# Test repository\n");
    commit(source, "initial public content");
    git(root, ["init", "--bare", "--initial-branch=main", remote]);
    git(source, ["remote", "add", "origin", remote]);
    git(source, ["push", "origin", "HEAD:refs/heads/main"]);

    const clean = runRemoteCheck(source);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /Remote public namespace check passed/);

    writeFileSync(join(source, "leak.txt"), `token ghp_${"Z".repeat(36)}\n`);
    commit(source, "synthetic pull request");
    git(source, ["push", "origin", "HEAD:refs/pull/1/head"]);

    const rejected = runRemoteCheck(source);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /history leak\.txt: GitHub token/);
    assert.doesNotMatch(rejected.stderr, /ghp_/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

function runSinceCheck(cwd, since, env = {}) {
  return spawnSync(process.execPath, [script, "--new-since", since], {
    cwd,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

test("a pull request scan reads its own history but not the already-scanned base", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  try {
    git(root, ["init", "--initial-branch=main"]);
    writeFileSync(join(root, "README.md"), "# Base\n");
    writeFileSync(join(root, "dev.log"), "retired local log\n");
    commit(root, "base with a retired path");
    git(root, ["rm", "-q", "dev.log"]);
    const base = commit(root, "remove the retired path");

    writeFileSync(join(root, "feature.md"), "# Feature\n");
    commit(root, "clean pull request commit");
    const clean = runSinceCheck(root, base);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, new RegExp(`Git objects new since ${base}`));
    assert.equal(spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" }).status, 1);

    writeFileSync(join(root, "problems.md"), "# Internal notes\n");
    commit(root, "add internal notes");
    git(root, ["rm", "-q", "problems.md"]);
    commit(root, "hide internal notes");
    const rejected = runSinceCheck(root, base);
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /history problems\.md: internal path is forbidden/);
    assert.doesNotMatch(rejected.stderr, /dev\.log/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("a partial clone fails the history scan when a blob was never fetched", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  const source = join(root, "source");
  const clone = join(root, "clone");
  try {
    mkdirSync(source);
    git(source, ["init", "--initial-branch=main"]);
    git(source, ["config", "uploadpack.allowFilter", "true"]);
    writeFileSync(join(source, "README.md"), "# Base\n");
    const base = commit(source, "base");
    writeFileSync(join(source, "draft.md"), "# Draft\n");
    commit(source, "add a draft");
    git(source, ["rm", "-q", "draft.md"]);
    commit(source, "remove the draft");

    git(root, ["clone", "-q", "--filter=blob:none", `file://${source}`, clone]);
    const result = runSinceCheck(clone, base, { GIT_NO_LAZY_FETCH: "1" });
    assert.equal(result.status, 1);
    // Git refuses to describe a blob it never fetched, so an incomplete
    // pull request fetch cannot pass for a clean history.
    assert.match(result.stderr, /missing blob object/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("--new-since rejects a missing commit and incompatible modes", () => {
  for (const args of [["--new-since"], ["--new-since", "--staged"], ["--new-since", "HEAD", "--staged"]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0, args.join(" "));
  }
});

test("the index check reads staged content, not the working tree", () => {
  const root = mkdtempSync(join(tmpdir(), "minddy-public-repository-test-"));
  const awsKey = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  try {
    git(root, ["init", "--initial-branch=main"]);
    writeFileSync(join(root, "README.md"), "# Clean\n");
    writeFileSync(join(root, "notes.md"), "# Clean\n");
    commit(root, "clean base");

    writeFileSync(join(root, "config.ts"), `export const key = "${awsKey}";\n`);
    git(root, ["add", "config.ts"]);
    writeFileSync(join(root, "config.ts"), "export const key = process.env.KEY;\n");
    const staged = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(staged.status, 1);
    assert.match(staged.stderr, /config\.ts: AWS key identifier/);
    assert.doesNotMatch(staged.stderr, /README\.md|notes\.md/);

    git(root, ["add", "config.ts"]);
    const cleaned = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
    assert.equal(cleaned.status, 0, cleaned.stderr);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
