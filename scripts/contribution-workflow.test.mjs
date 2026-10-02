import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import {
  hasExpectedSignoff,
  mainBackupName,
  normalizeBranchName,
  parsePullRequestArguments,
} from "./contribution-workflow.mjs";

test("normalizeBranchName turns a plain work name into a memorable branch", () => {
  assert.equal(normalizeBranchName("Resume failed agents"), "work/resume-failed-agents");
  assert.equal(normalizeBranchName("Résumé display"), "work/resume-display");
});

test("normalizeBranchName preserves an explicit valid branch", () => {
  assert.equal(normalizeBranchName("fix/agent-resume"), "fix/agent-resume");
});

test("normalizeBranchName rejects empty and protected names", () => {
  assert.throws(() => normalizeBranchName(""), /Give the work a short name/);
  assert.throws(() => normalizeBranchName("main"), /protected branch main/);
  assert.throws(() => normalizeBranchName("production"), /protected branch production/);
});

test("hasExpectedSignoff matches the commit author without changing case", () => {
  const message = [
    "fix: resume failed agents",
    "",
    "Signed-off-by: Clément <user@example.com>",
  ].join("\n");
  assert.equal(hasExpectedSignoff(message, "Clément", "user@example.com"), true);
  assert.equal(hasExpectedSignoff(message, "Someone else", "user@example.com"), false);
});

test("mainBackupName is stable and safe for a Git branch", () => {
  const name = mainBackupName(new Date("2026-09-01T12:34:56.789Z"));
  assert.equal(name, "backup/main-before-sync-2026-09-01T12-34-56-789Z");
  assert.doesNotMatch(name, /[: ]/u);
});

test("parsePullRequestArguments collects the title and the -m paragraphs", () => {
  assert.deepEqual(parsePullRequestArguments([]), { title: "", body: "", replace: false });
  assert.deepEqual(
    parsePullRequestArguments(["Add change.txt", "-m", "What and why.", "-m", "How to review."]),
    {
      title: "Add change.txt",
      body: "What and why.\n\nHow to review.",
      replace: false,
    },
  );
  assert.deepEqual(
    parsePullRequestArguments(["-m", "Only a description."]),
    { title: "", body: "Only a description.", replace: false },
  );
  assert.deepEqual(
    parsePullRequestArguments(["New title", "--replace"]),
    { title: "New title", body: "", replace: true },
  );
  assert.throws(() => parsePullRequestArguments(["-m"]), /needs a description/u);
  assert.throws(() => parsePullRequestArguments(["--fill"]), /Unknown option: --fill/u);
});

function run(command, args, cwd, env = process.env) {
  return execFileSync(command, args, { cwd, encoding: "utf8", env });
}

test("the shortcut workflow creates, publishes, and cleans up a work branch", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "minddy-workflow-"));
  const remote = join(fixtureRoot, "origin.git");
  const repository = join(fixtureRoot, "repository");
  const bin = join(fixtureRoot, "bin");

  try {
    mkdirSync(repository);
    mkdirSync(join(repository, "scripts"));
    mkdirSync(bin);
    run("git", ["init", "--bare", "--initial-branch=main", remote], fixtureRoot);
    run("git", ["init", "--initial-branch=main"], repository);
    run("git", ["config", "user.name", "Test Maintainer"], repository);
    run("git", ["config", "user.email", "maintainer@example.com"], repository);
    run("git", ["remote", "add", "origin", remote], repository);

    const workflow = join(repository, "scripts", "contribution-workflow.mjs");
    copyFileSync(new URL("./contribution-workflow.mjs", import.meta.url), workflow);
    writeFileSync(join(repository, "README.md"), "# Fixture\n");
    run("git", ["add", "."], repository);
    run("git", ["commit", "--signoff", "-m", "Initialize fixture"], repository);
    run("git", ["push", "--set-upstream", "origin", "main"], repository);

    const fakeGh = join(bin, "gh");
    writeFileSync(
      fakeGh,
      `#!/usr/bin/env node
const { appendFileSync, existsSync, readFileSync, writeFileSync } = await import("node:fs");
const args = process.argv.slice(2);
const statePath = process.env.FAKE_PR_STATE;
if (args[0] === "auth" && args[1] === "status") process.exit(0);
if (args[0] === "pr" && args[1] === "list") {
  if (args.includes("merged") && process.env.FAKE_PR_MERGED === "1") {
    const { execFileSync } = await import("node:child_process");
    const headRefOid = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    console.log(JSON.stringify([
      { url: "https://example.test/pull/old", headRefOid: "1111111111111111111111111111111111111111" },
      { url: "https://example.test/pull/1", headRefOid },
    ]));
  } else if (args.includes("merged") && process.env.FAKE_HISTORICAL_PR === "1") {
    console.log(JSON.stringify([
      { url: "https://example.test/pull/old", headRefOid: "1111111111111111111111111111111111111111" },
    ]));
  } else if (args.includes("open")) {
    if (existsSync(statePath)) {
      console.log(JSON.parse(readFileSync(statePath, "utf8")).url);
    }
  }
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "create") {
  const state = {
    url: "https://example.test/pull/1",
    title: args[args.indexOf("--title") + 1],
    body: args[args.indexOf("--body") + 1],
  };
  writeFileSync(statePath, JSON.stringify(state));
  appendFileSync(process.env.FAKE_GH_LOG ?? "", JSON.stringify(args) + "\\n");
  console.log("https://example.test/pull/1");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "edit") {
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  if (args.includes("--title")) state.title = args[args.indexOf("--title") + 1];
  if (args.includes("--body")) state.body = args[args.indexOf("--body") + 1];
  writeFileSync(statePath, JSON.stringify(state));
  appendFileSync(process.env.FAKE_GH_LOG ?? "", JSON.stringify(args) + "\\n");
  console.log("https://example.test/pull/1");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view") {
  console.log("https://example.test/pull/1");
  process.exit(0);
}
process.exit(2);
`,
    );
    chmodSync(fakeGh, 0o755);
    const prState = join(fixtureRoot, "pr.json");
    const env = {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH}`,
      FAKE_PR_STATE: prState,
    };

    writeFileSync(join(repository, "change.txt"), "change\n");
    run(process.execPath, [workflow, "start", "Helpful fix"], repository, env);
    assert.equal(
      run("git", ["branch", "--show-current"], repository).trim(),
      "work/helpful-fix",
    );

    run("git", ["add", "change.txt"], repository);
    run(
      "git",
      [
        "-c",
        "user.name=Contributing Author",
        "-c",
        "user.email=author@example.com",
        "commit",
        "-m",
        "Add helpful fix",
      ],
      repository,
    );
    const ghLog = join(fixtureRoot, "gh.log");
    run(process.execPath, [workflow, "pr", "Add helpful fix", "-m", "Adds change.txt."], repository, {
      ...env,
      FAKE_GH_LOG: ghLog,
    });

    const ghCalls = readFileSync(ghLog, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(
      ghCalls.find((call) => call[1] === "create"),
      [
        "pr",
        "create",
        "--base",
        "main",
        "--head",
        "work/helpful-fix",
        "--title",
        "Add helpful fix",
        "--body",
        "Adds change.txt.",
      ],
    );

    const commitMessage = run("git", ["show", "-s", "--format=%B"], repository);
    assert.match(
      commitMessage,
      /Signed-off-by: Contributing Author <author@example\.com>/u,
    );

    // Simulate a maintainer editing the PR after its initial publication.
    run(
      "gh",
      ["pr", "edit", "work/helpful-fix", "--title", "Reviewed title", "--body", "Reviewed body."],
      repository,
      { ...env, FAKE_GH_LOG: ghLog },
    );
    const reviewedState = readFileSync(prState, "utf8");

    writeFileSync(join(repository, "change.txt"), "change\nmore\n");
    run("git", ["add", "change.txt"], repository);
    run(
      "git",
      [
        "-c",
        "user.name=Contributing Author",
        "-c",
        "user.email=author@example.com",
        "commit",
        "-m",
        "Extend helpful fix",
      ],
      repository,
    );
    const ghLogOffset = readFileSync(ghLog, "utf8").length;
    run(process.execPath, [workflow, "pr"], repository, { ...env, FAKE_GH_LOG: ghLog });
    assert.equal(readFileSync(ghLog, "utf8").slice(ghLogOffset), "");
    assert.equal(readFileSync(prState, "utf8"), reviewedState);
    assert.equal(
      run("git", ["ls-remote", "--heads", "origin", "refs/heads/work/helpful-fix"], repository)
        .trim()
        .length > 0,
      true,
    );

    // Repeated fix commits publish successfully even with fresh metadata.
    const followUpMetadata = [["New title"], ["-m", "New body."], ["New title", "-m", "New body."]];
    for (const metadata of followUpMetadata) {
      run("git", ["commit", "--allow-empty", "--signoff", "-m", "fix: follow up review"], repository);
      const result = run(process.execPath, [workflow, "pr", ...metadata], repository, {
        ...env,
        FAKE_GH_LOG: ghLog,
      });
      assert.match(result, /title and description kept/u);
      assert.ok(result.includes("Pull request updated: https://example.test/pull/1"));
      assert.equal(readFileSync(ghLog, "utf8").slice(ghLogOffset), "");
      assert.equal(readFileSync(prState, "utf8"), reviewedState);
      assert.equal(
        run("git", ["ls-remote", "--heads", "origin", "refs/heads/work/helpful-fix"], repository)
          .trim()
          .split("\t")[0],
        run("git", ["rev-parse", "HEAD"], repository).trim(),
      );
    }
    run(
      process.execPath,
      [workflow, "pr", "New title", "-m", "New body.", "--replace"],
      repository,
      { ...env, FAKE_GH_LOG: ghLog },
    );
    const ghCallsAfterReplace = readFileSync(ghLog, "utf8")
      .slice(ghLogOffset)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      ghCallsAfterReplace.find((call) => call[1] === "edit"),
      ["pr", "edit", "work/helpful-fix", "--title", "New title", "--body", "New body."],
    );
    assert.deepEqual(JSON.parse(readFileSync(prState, "utf8")), {
      url: "https://example.test/pull/1",
      title: "New title",
      body: "New body.",
    });
    run(process.execPath, [workflow, "pr", "Final title", "--replace"], repository, {
      ...env,
      FAKE_GH_LOG: ghLog,
    });
    assert.deepEqual(JSON.parse(readFileSync(prState, "utf8")), {
      url: "https://example.test/pull/1",
      title: "Final title",
      body: "New body.",
    });
    run(process.execPath, [workflow, "pr", "-m", "Final body.", "--replace"], repository, {
      ...env,
      FAKE_GH_LOG: ghLog,
    });
    assert.deepEqual(JSON.parse(readFileSync(prState, "utf8")), {
      url: "https://example.test/pull/1",
      title: "Final title",
      body: "Final body.",
    });

    const historicalDone = spawnSync(process.execPath, [workflow, "done"], {
      cwd: repository,
      encoding: "utf8",
      env: { ...env, FAKE_HISTORICAL_PR: "1" },
    });
    assert.notEqual(historicalDone.status, 0);
    assert.match(historicalDone.stderr, /pull request is not merged yet/u);
    assert.equal(
      run("git", ["branch", "--show-current"], repository).trim(),
      "work/helpful-fix",
    );

    run("git", ["push", "origin", "HEAD:main"], repository);
    run(
      process.execPath,
      [workflow, "done"],
      repository,
      { ...env, FAKE_PR_MERGED: "1" },
    );
    assert.equal(run("git", ["branch", "--show-current"], repository).trim(), "main");
    assert.equal(
      run("git", ["branch", "--list", "work/helpful-fix"], repository).trim(),
      "",
    );
    assert.equal(
      run("git", ["ls-remote", "--heads", "origin", "refs/heads/work/helpful-fix"], repository)
        .trim(),
      "",
    );
    assert.equal(readFileSync(join(repository, "change.txt"), "utf8"), "change\nmore\n");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
