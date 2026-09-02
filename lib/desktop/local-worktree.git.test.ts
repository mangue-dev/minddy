import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localWorktreePath, prepareLocalWorktree } from "./local-worktree";
import { PR_BASE_TAG } from "../server/agent/pr-refs";

let root = "";
let repo = "";
let runRoot = "";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), "minddy-local-worktree-")));
  repo = path.join(root, "checkout");
  runRoot = path.join(root, "agent-runs", "run-1");
  git(root, ["init", "--initial-branch=main", repo]);
  git(repo, ["config", "user.email", "human@example.com"]);
  git(repo, ["config", "user.name", "Human"]);
  writeFileSync(path.join(repo, "tracked.txt"), "base\n");
  git(repo, ["add", "tracked.txt"]);
  git(repo, ["commit", "-m", "base"]);
  // The important setup detail: this checkout carries uncommitted work.
  writeFileSync(path.join(repo, "tracked.txt"), "human WIP\n");
  writeFileSync(path.join(repo, "notes.txt"), "keep me\n");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("prepareLocalWorktree", () => {
  it("creates a detached checkout without taking the attached repository's WIP", () => {
    const result = prepareLocalWorktree({
      sourceRepo: repo,
      runRoot,
      baseBranch: "main",
      workBranch: "minddy/run-1",
    });
    expect(result).toEqual({ ok: true, path: localWorktreePath(runRoot), reused: false });
    expect(readFileSync(path.join(localWorktreePath(runRoot), "tracked.txt"), "utf8")).toBe("base\n");
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toBe("human WIP\n");
    expect(readFileSync(path.join(repo, "notes.txt"), "utf8")).toBe("keep me\n");
    expect(git(localWorktreePath(runRoot), ["branch", "--show-current"]).trim()).toBe("");
  });

  it("reuses the same checkout for the session's next turn", () => {
    const result = prepareLocalWorktree({
      sourceRepo: repo,
      runRoot,
      baseBranch: "main",
      workBranch: "minddy/run-1",
    });
    expect(result).toEqual({ ok: true, path: localWorktreePath(runRoot), reused: true });
  });

  it("checks out a provider pull-request ref in an isolated review worktree", () => {
    const base = git(repo, ["rev-parse", "HEAD"]).trim();
    const review = git(repo, [
      "commit-tree",
      `${base}^{tree}`,
      "-p",
      base,
      "-m",
      "review head",
    ]).trim();
    git(repo, ["update-ref", "refs/pull/7/head", review]);
    const reviewRunRoot = path.join(root, "agent-runs", "review-1");

    const result = prepareLocalWorktree({
      sourceRepo: repo,
      runRoot: reviewRunRoot,
      baseBranch: "main",
      workBranch: "minddy/review-7",
      checkoutRef: "refs/pull/7/head",
      checkoutBaseSha: base,
      authUrl: repo,
    });

    expect(result).toEqual({
      ok: true,
      path: localWorktreePath(reviewRunRoot),
      reused: false,
    });
    expect(git(localWorktreePath(reviewRunRoot), ["rev-parse", "HEAD"]).trim()).toBe(review);
    expect(
      git(localWorktreePath(reviewRunRoot), ["rev-parse", PR_BASE_TAG]).trim(),
    ).toBe(base);
    expect(() => git(repo, ["rev-parse", "--verify", PR_BASE_TAG])).toThrow();
    expect(readFileSync(path.join(repo, "tracked.txt"), "utf8")).toBe("human WIP\n");
  });

  it("fails when an explicit pull-request ref cannot be fetched", () => {
    const missingRefRunRoot = path.join(root, "agent-runs", "review-missing");

    const result = prepareLocalWorktree({
      sourceRepo: repo,
      runRoot: missingRefRunRoot,
      baseBranch: "main",
      workBranch: "minddy/review-missing",
      checkoutRef: "refs/pull/404/head",
      authUrl: repo,
    });

    expect(result).toEqual({
      ok: false,
      message: "Git could not create the isolated worktree.",
    });
  });
});
