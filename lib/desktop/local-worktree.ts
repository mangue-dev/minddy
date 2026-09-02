import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PR_BASE_TAG } from "../server/agent/pr-refs";

/**
 * CHECKOUT ISOLATED FROM A LOCAL TOWER.
 *
 * The attached repository remains the human anchor point: it is he who carries the
 * remotes, credentials and, potentially, uncommitted work. A
 * worktree is created under the run's own root, on a detached HEAD. So the
 * harness can use the normal delivery path (commit + push) without
 * moving the person's branch, index or working tree.
 */

export function localWorktreePath(runRoot: string): string {
  return path.join(runRoot, "repo");
}

export type LocalWorktreeResult =
  | { readonly ok: true; readonly path: string; readonly reused: boolean }
  | { readonly ok: false; readonly message: string };

/**
 * Creates or finds the worktree of a run.
 *
 * `git worktree add --detach` is voluntary: the commit branch is not
 * checked out in the attached repository and therefore cannot move someone's work
 *. The harness then pushes its detached HEAD towards `workBranch`.
 */
export function prepareLocalWorktree(opts: {
  sourceRepo: string;
  runRoot: string;
  baseBranch?: string | null;
  workBranch: string;
  checkoutRef?: string;
  checkoutBaseSha?: string;
  authUrl?: string;
}): LocalWorktreeResult {
  const destination = localWorktreePath(opts.runRoot);
  const source = path.resolve(opts.sourceRepo);
  const wanted = path.resolve(destination);

  try {
    // A root deleted by the household leaves an administrative entry in
    // the source repository. Git knows how to remove them, without touching human checkout.
    git(source, ["worktree", "prune"]);
    const registered = git(source, ["worktree", "list", "--porcelain"])
      .split("\n")
      .some(
        (line) =>
          line.startsWith("worktree ") &&
          path.resolve(line.slice(9)) === wanted,
      );
    if (registered) {
      // A failed push leaves a committed tip in this worktree while the server
      // still has no branch_name. Re-checking out checkoutRef here would discard
      // that recoverable work. Only repair the independent review-base anchor.
      prepareReviewBase(destination, opts);
      return { ok: true, path: destination, reused: true };
    }
    if (existsSync(destination)) {
      return {
        ok: false,
        message:
          "The isolated worktree folder already exists but is not registered by Git.",
      };
    }

    mkdirSync(path.dirname(destination), { recursive: true });
    const base = localBaseRef(
      source,
      opts.runRoot,
      opts.baseBranch,
      opts.authUrl,
    );
    git(source, ["worktree", "add", "--detach", destination, base]);

    // A resumed session may have already pushed its branch from another
    // machine. Resume this tip is the local counterpart of `cloneRepo`; the absence
    // branch is normal for the first round and leaves the base checkouted.
    prepareReviewCheckout(destination, opts);
    prepareReviewBase(destination, opts);
    return { ok: true, path: destination, reused: false };
  } catch {
    // Raw git diagnostics may contain the authenticated URL. THE
    // launcher log therefore only receives a pattern without secrets.
    return {
      ok: false,
      message: "Git could not create the isolated worktree.",
    };
  }
}

function prepareReviewCheckout(
  destination: string,
  opts: {
    workBranch: string;
    checkoutRef?: string;
    checkoutBaseSha?: string;
    authUrl?: string;
  },
): void {
  const authUrl = opts.authUrl?.trim();
  const requiredCheckoutRef = opts.checkoutRef?.trim();
  const checkoutRef = requiredCheckoutRef || opts.workBranch.trim();

  if (requiredCheckoutRef) {
    if (!authUrl)
      throw new Error("A pull-request checkout requires a remote URL");
    git(destination, ["fetch", "--quiet", authUrl, requiredCheckoutRef]);
    git(destination, ["checkout", "--detach", "FETCH_HEAD"]);
  } else if (authUrl && checkoutRef) {
    const fetched = tryGit(destination, [
      "fetch",
      "--quiet",
      authUrl,
      checkoutRef,
    ]);
    if (fetched) git(destination, ["checkout", "--detach", "FETCH_HEAD"]);
  }
}

function prepareReviewBase(
  destination: string,
  opts: {
    checkoutBaseSha?: string;
    authUrl?: string;
  },
): void {
  const authUrl = opts.authUrl?.trim();
  const baseSha = opts.checkoutBaseSha?.trim() ?? "";
  if (!authUrl || !/^[0-9a-f]{7,64}$/i.test(baseSha)) return;
  if (tryGit(destination, ["fetch", "--quiet", authUrl, baseSha])) {
    // Tags and ordinary refs are shared by every linked worktree. An uppercase
    // pseudoref lives in this worktree's own Git directory instead, so parallel
    // local reviews cannot overwrite one another or alter the attached checkout.
    const gitDir = git(destination, ["rev-parse", "--git-dir"]).trim();
    writeFileSync(
      path.join(path.resolve(destination, gitDir), PR_BASE_TAG),
      `${baseSha}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  }
}

/**
 * A branch proposed by the picker may not yet exist locally. On
 * then brings it back under a private ref to minddy, without creating or moving a
 * branch visible in the attached checkout. This is the same promise as the current checkout mode
 *, but the worktree can then start exactly from the requested base
 * rather than the HEAD of the person.
 */
function localBaseRef(
  sourceRepo: string,
  runRoot: string,
  baseBranch: string | null | undefined,
  authUrl: string | undefined,
): string {
  const branch = baseBranch?.trim();
  if (!branch) return "HEAD";
  const localRef = `refs/heads/${branch}`;
  if (
    tryGit(sourceRepo, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${localRef}^{commit}`,
    ])
  ) {
    return localRef;
  }
  if (!authUrl?.trim()) return localRef;

  const run = path.basename(runRoot).replace(/[^A-Za-z0-9_-]/g, "-") || "run";
  const privateRef = `refs/minddy/worktree/${run}/base`;
  const fetched = tryGit(sourceRepo, [
    "fetch",
    "--no-tags",
    "--quiet",
    authUrl,
    `+refs/heads/${branch}:${privateRef}`,
  ]);
  return fetched ? privateRef : localRef;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function tryGit(cwd: string, args: string[]): boolean {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}
