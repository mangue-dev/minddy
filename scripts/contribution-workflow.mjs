#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROTECTED_BRANCHES = new Set(["main", "production"]);

function commandError(command, args, result) {
  const detail = result.stderr?.trim() || result.stdout?.trim();
  const suffix = detail ? `\n${detail}` : "";
  return new Error(`Command failed: ${command} ${args.join(" ")}${suffix}`);
}

function run(command, args, options = {}) {
  const capture = options.capture ?? false;
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    throw new Error(`Could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw commandError(command, args, result);
  }
  return capture ? (result.stdout ?? "").trim() : "";
}

function git(args, options = {}) {
  return run("git", args, options);
}

function gh(args, options = {}) {
  return run("gh", args, options);
}

function workingTreeHasChanges() {
  return Boolean(git(["status", "--porcelain"], { capture: true }));
}

function ensureCleanWorkingTree() {
  if (workingTreeHasChanges()) {
    throw new Error(
      "Uncommitted changes found. Commit them in VS Code, then run this command again.",
    );
  }
}

function ensureGitHubCli() {
  gh(["auth", "status"], { capture: true });
}

function currentBranch() {
  const branch = git(["branch", "--show-current"], { capture: true });
  if (!branch) {
    throw new Error("Detached HEAD found. Switch to a branch before continuing.");
  }
  return branch;
}

export function normalizeBranchName(input) {
  const candidate = input?.trim();
  if (!candidate) {
    throw new Error(
      'Give the work a short name, for example: npm run work:start -- "resume failed agents"',
    );
  }

  const explicitBranch = /^[a-z0-9][a-z0-9._/-]*$/u.test(candidate)
    ? candidate
    : null;
  const slug = candidate
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const branch = explicitBranch ?? `work/${slug}`;

  if (!slug || PROTECTED_BRANCHES.has(branch)) {
    throw new Error(`Choose a work name instead of the protected branch ${branch}.`);
  }
  return branch;
}

function branchExists(branch) {
  const local = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], {
    cwd: ROOT_DIR,
  });
  const remote = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`],
    { cwd: ROOT_DIR },
  );
  return local.status === 0 || remote.status === 0;
}

function remoteBranchExists(branch) {
  const result = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`],
    { cwd: ROOT_DIR, stdio: "ignore" },
  );
  return result.status === 0;
}

function commitsSinceMain() {
  const output = git(
    ["rev-list", "--reverse", "--no-merges", "origin/main..HEAD"],
    { capture: true },
  );
  return output ? output.split("\n") : [];
}

export function hasExpectedSignoff(message, authorName, authorEmail) {
  const expected = `signed-off-by: ${authorName} <${authorEmail}>`.toLowerCase();
  return message
    .split(/\r?\n/u)
    .some((line) => line.trim().toLowerCase() === expected);
}

function unsignedCommits() {
  return commitsSinceMain().filter((commit) => {
    const metadata = git(
      ["show", "-s", "--format=%an%x00%ae%x00%B", commit],
      { capture: true },
    );
    const [authorName, authorEmail, ...messageParts] = metadata.split("\u0000");
    return !hasExpectedSignoff(messageParts.join("\u0000"), authorName, authorEmail);
  });
}

function signoffCurrentCommit() {
  const metadata = git(
    ["show", "-s", "--format=%an%x00%ae%x00%B", "HEAD"],
    { capture: true },
  );
  const [authorName, authorEmail, ...messageParts] = metadata.split("\u0000");
  if (hasExpectedSignoff(messageParts.join("\u0000"), authorName, authorEmail)) {
    return;
  }
  git([
    "commit",
    "--amend",
    "--no-edit",
    "--trailer",
    `Signed-off-by: ${authorName} <${authorEmail}>`,
  ]);
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function repairSignoffs() {
  const missing = unsignedCommits();
  if (missing.length === 0) {
    return false;
  }

  console.log(`Adding the required DCO sign-off to ${missing.length} commit(s)...`);
  const repairCommand = [process.execPath, fileURLToPath(import.meta.url), "signoff-head"]
    .map(shellQuote)
    .join(" ");
  git(["rebase", "--exec", repairCommand, "origin/main"]);
  const remaining = unsignedCommits();
  if (remaining.length > 0) {
    throw new Error(
      `DCO sign-off still missing from: ${remaining.map((sha) => sha.slice(0, 8)).join(", ")}`,
    );
  }
  return true;
}

function startWork(args) {
  if (args.length !== 1) {
    throw new Error(
      'Give the work one short name, for example: npm run work:start -- "resume failed agents"',
    );
  }
  const sourceBranch = currentBranch();
  const hasChanges = workingTreeHasChanges();
  if (hasChanges && sourceBranch !== "main") {
    throw new Error(
      "Uncommitted changes found on another work branch. Commit them in VS Code before starting new work.",
    );
  }
  const branch = normalizeBranchName(args[0]);

  console.log("Refreshing origin/main...");
  git(["fetch", "origin", "main", "--prune"]);
  git(["check-ref-format", "--branch", branch], { capture: true });
  if (branchExists(branch)) {
    throw new Error(`Branch ${branch} already exists. Choose another work name.`);
  }

  if (hasChanges) {
    console.log("Keeping the current uncommitted changes on the new work branch...");
  }
  git(["switch", "--create", branch, "origin/main"]);
  console.log(`\nReady on ${branch}.`);
  console.log("Make changes and commit them in VS Code, then run: npm run work:pr");
}

function publishPullRequest(args) {
  if (args.length !== 0) {
    throw new Error("work:pr does not accept arguments.");
  }
  ensureCleanWorkingTree();
  ensureGitHubCli();
  const branch = currentBranch();
  if (PROTECTED_BRANCHES.has(branch)) {
    throw new Error("Start a work branch before opening a pull request.");
  }

  console.log("Refreshing origin/main...");
  git(["fetch", "origin", "main", "--prune"]);
  if (commitsSinceMain().length === 0) {
    throw new Error("No commit found for this pull request. Commit your changes in VS Code first.");
  }

  const existedRemotely = remoteBranchExists(branch);
  const rewritten = repairSignoffs();
  git(["diff", "--check", "origin/main...HEAD"]);

  console.log("Pushing the work branch...");
  const pushArgs = ["push", "--set-upstream", "origin", "HEAD"];
  if (rewritten && existedRemotely) {
    pushArgs.splice(1, 0, "--force-with-lease");
  }
  git(pushArgs);

  const existingUrl = gh(
    [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--limit",
      "1",
      "--json",
      "url",
      "--jq",
      ".[0].url // empty",
    ],
    { capture: true },
  );
  if (existingUrl) {
    console.log(`\nPull request updated: ${existingUrl}`);
    return;
  }

  gh(["pr", "create", "--base", "main", "--head", branch, "--fill"]);
  const createdUrl = gh(
    ["pr", "view", branch, "--json", "url", "--jq", ".url"],
    { capture: true },
  );
  console.log(`\nPull request created: ${createdUrl}`);
  console.log("Merge it on GitHub after the checks pass, then run: npm run work:done");
}

export function mainBackupName(date = new Date()) {
  return `backup/main-before-sync-${date.toISOString().replace(/[:.]/gu, "-")}`;
}

function finishWork(args) {
  if (args.length !== 0) {
    throw new Error("work:done does not accept arguments.");
  }
  ensureCleanWorkingTree();
  ensureGitHubCli();
  const branch = currentBranch();
  if (PROTECTED_BRANCHES.has(branch)) {
    throw new Error("Run this command from the work branch after its pull request is merged.");
  }

  const headRevision = git(["rev-parse", "HEAD"], { capture: true });
  const mergedPullRequests = JSON.parse(gh(
    [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "merged",
      "--limit",
      "100",
      "--json",
      "url,headRefOid",
    ],
    { capture: true },
  ) || "[]");
  const mergedUrl = mergedPullRequests.find(
    (pullRequest) => pullRequest.headRefOid === headRevision,
  )?.url;
  if (!mergedUrl) {
    throw new Error("The pull request is not merged yet. Merge it on GitHub, then try again.");
  }

  console.log("Refreshing origin/main...");
  git(["fetch", "origin", "main", "--prune"]);
  const uniqueMainCommits = git(
    ["rev-list", "main", "--not", "origin/main"],
    { capture: true },
  );
  if (uniqueMainCommits) {
    const backup = mainBackupName();
    git(["branch", backup, "main"]);
    console.log(`Preserved the previous local main as ${backup}.`);
  }

  if (remoteBranchExists(branch)) {
    git(["push", "origin", "--delete", branch]);
  }
  git(["branch", "--force", "main", "origin/main"]);
  git(["switch", "main"]);
  git(["branch", "--delete", "--force", branch]);

  console.log(`\nDone. ${mergedUrl} is merged and local main matches origin/main.`);
  console.log("Run npm run deploy only when this version should reach production.");
}

function printHelp() {
  console.log(`Minddy contribution workflow

  npm run work:start -- "short work name"  Start from the latest origin/main
  npm run work:pr                         Push and open or update the pull request
  npm run work:done                       Return to a clean main after the merge

Commit from the VS Code Source Control view. Workspace settings add the DCO
sign-off automatically.`);
}

export function main(argv = process.argv.slice(2)) {
  const [action, ...args] = argv;
  if (!action || action === "help" || action === "--help" || action === "-h") {
    printHelp();
    return;
  }

  if (action === "start") {
    startWork(args);
  } else if (action === "pr") {
    publishPullRequest(args);
  } else if (action === "done") {
    finishWork(args);
  } else if (action === "signoff-head") {
    signoffCurrentCommit();
  } else {
    throw new Error(`Unknown action: ${action}. Run the script with --help.`);
  }
}

const entryPoint = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (entryPoint === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
