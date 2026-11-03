import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Runs the CI step that picks and fetches the history scanned by the
// publication guards, exactly as checked in, against a local partial clone.
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const step = workflow.match(
  /- name: Choose and fetch the history scan scope\n[\s\S]*?\n {8}run: \|\n((?: {10}.*\n|\n)+)/,
)?.[1];
const scopeScript = step?.replace(/^ {10}/gm, "");

const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.test"];

function git(cwd, args, env = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function commitFiles(cwd, files, message) {
  for (const [path, content] of Object.entries(files)) {
    if (content === null) git(cwd, ["rm", "-q", path]);
    else writeFileSync(join(cwd, path), content);
  }
  git(cwd, ["add", "-A"]);
  git(cwd, [...identity, "commit", "-q", "-m", message]);
  return git(cwd, ["rev-parse", "HEAD"]);
}

function blobId(cwd, commit, path) {
  return git(cwd, ["rev-parse", `${commit}:${path}`]);
}

/**
 * Builds a base branch and a pull request whose merge commit is published like
 * GitHub's `refs/pull/<n>/merge`, then checks it out as a blob-less clone.
 */
function pullRequestFixture(pullRequestFiles) {
  const root = mkdtempSync(join(tmpdir(), "minddy-ci-history-scope-"));
  const source = join(root, "source");
  const clone = join(root, "clone");
  mkdirSync(source);
  git(source, ["init", "-q", "--initial-branch=main"]);
  git(source, ["config", "uploadpack.allowFilter", "true"]);
  git(source, ["config", "uploadpack.allowAnySHA1InWant", "true"]);
  const first = commitFiles(source, { "README.md": "# First\n", ".gitleaks.toml": "title = \"policy\"\n" }, "first");
  const base = commitFiles(source, { "README.md": "# Second\n" }, "base");
  git(source, ["switch", "-q", "-c", "feature"]);
  commitFiles(source, { "draft.md": "# Draft\n" }, "add a draft");
  const head = commitFiles(source, { "draft.md": null, ...pullRequestFiles }, "pull request");
  const merge = git(source, [...identity, "commit-tree", `${head}^{tree}`, "-p", base, "-p", head, "-m", "Merge"]);
  git(source, ["update-ref", "refs/pull/1/merge", merge]);

  git(root, ["clone", "-q", "--filter=blob:none", "--no-checkout", `file://${source}`, clone]);
  git(clone, ["fetch", "-q", "origin", "refs/pull/1/merge"]);
  git(clone, ["checkout", "-q", "--detach", merge]);
  return { root, source, clone, first, base, head };
}

function runScope(clone, root, event) {
  const output = join(root, "output");
  writeFileSync(output, "");
  const result = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", scopeScript], {
    cwd: clone,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GITHUB_EVENT_NAME: event,
      GITHUB_OUTPUT: output,
      RUNNER_TEMP: root,
      GIT_NO_LAZY_FETCH: "1",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return Object.fromEntries(
    readFileSync(output, "utf8").trim().split("\n").map((line) => line.split(/=(.*)/s).slice(0, 2)),
  );
}

function hasObject(clone, id) {
  return spawnSync("git", ["cat-file", "-e", id], {
    cwd: clone,
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  }).status === 0;
}

test("the CI workflow still defines the history scope step", () => {
  assert.ok(scopeScript, "the scope step must remain an inline bash script");
  assert.match(scopeScript, /set -euo pipefail/);
});

test("a pull request fetches and scans only what it adds on top of the base branch", () => {
  const fixture = pullRequestFixture({ "feature.md": "# Feature\n" });
  try {
    const outputs = runScope(fixture.clone, fixture.root, "pull_request");
    assert.equal(outputs.since, fixture.base);
    assert.equal(outputs.log_opts, `${fixture.base}..HEAD`);
    // The draft added then removed inside the pull request is history the
    // scanners must read, while the base branch's own past stays unfetched.
    assert.ok(hasObject(fixture.clone, blobId(fixture.source, `${fixture.head}~1`, "draft.md")));
    assert.ok(!hasObject(fixture.clone, blobId(fixture.source, fixture.first, "README.md")));
    git(fixture.clone, ["log", "-p", "-U0", "--format=", outputs.log_opts], { GIT_NO_LAZY_FETCH: "1" });
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("a pull request that changes the scanning rules rescans the whole history", () => {
  const fixture = pullRequestFixture({ ".gitleaks.toml": "title = \"stricter policy\"\n" });
  try {
    const outputs = runScope(fixture.clone, fixture.root, "pull_request");
    assert.equal(outputs.since, undefined);
    assert.equal(outputs.log_opts, "--all");
    assert.ok(hasObject(fixture.clone, blobId(fixture.source, fixture.first, "README.md")));
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});

test("a push to main scans the whole history", () => {
  const fixture = pullRequestFixture({ "feature.md": "# Feature\n" });
  try {
    const outputs = runScope(fixture.clone, fixture.root, "push");
    assert.equal(outputs.since, undefined);
    assert.equal(outputs.log_opts, "--all");
    assert.ok(hasObject(fixture.clone, blobId(fixture.source, fixture.first, "README.md")));
  } finally {
    rmSync(fixture.root, { force: true, recursive: true });
  }
});
