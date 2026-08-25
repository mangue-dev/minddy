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
