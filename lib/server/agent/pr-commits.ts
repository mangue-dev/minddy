import "server-only";

import { NextResponse } from "next/server";
import { commitAuthors } from "@/lib/commit-authors";
import { imageMimeType } from "@/lib/diff-binary";
import type { PullRequestCommit } from "@/lib/pull-request-contract";
import type { CommitExtras } from "./pr";
import { forgeErrorResponse } from "./pr-access";
import { basePathOf, imageBytesResponse, type FileSide } from "./pr-files";
import type { PrScope } from "./pr-scope";

/**
 * The commits of the PR: the Commits tab, as on GitHub.
 *
 * Kept out of the detail response: the detail is polled every 15 seconds while
 * CI runs, and commits only move on a push, so adding them there would cost a
 * forge round trip per poll for the same list.
 *
 * Read on the installation token like every PR read.
 */
export async function prCommitsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    // Each commit's size and authors come from a second call: neither forge
    // serves them with the list. Best effort: without it the list shows
    // without the +/− counts, and each commit's diff still opens.
    const [{ commits, truncated }, extras] = await Promise.all([
      scope.forge.listPullRequestCommits(scope.call),
      scope.forge
      .listPullRequestCommitExtras(scope.call)
      .catch(() => {
        console.error("[pr-actions] commit_extras_unreadable");
        return new Map<string, CommitExtras>();
      }),
    ]);
    return NextResponse.json({
      commits: commits.map((c) => {
        const e = extras.get(c.sha);
        return {
          ...c,
          additions: e?.additions ?? c.additions,
          deletions: e?.deletions ?? c.deletions,
          // The forge's authors when it resolved them (GitHub, with accounts
          // and avatars); otherwise the message trailers, the only source on
          // GitLab and the fallback when GraphQL did not answer.
          authors: commitAuthors(c, e?.authors),
        };
      }),
      truncated,
    });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * A commit SHA as it arrives in a URL, checked before any call: it is
 * interpolated into a forge route, and the installation token covers the
 * whole installation, not this one repository (same care as `in_reply_to`
 * and `thread_id`).
 */
export function isCommitSha(raw: string): boolean {
  return /^[0-9a-f]{7,64}$/i.test(raw);
}

/**
 * The commit `sha` **if it belongs to this PR**, otherwise null.
 *
 * This is the same validation used for paths in `prFileSourceResponse`, for the
 * same reason: without it, commit routes could read the diff of any repository
 * commit, including branches the PR does not touch.
 */
async function resolvePrCommit(
  scope: PrScope,
  sha: string,
): Promise<PullRequestCommit | null> {
  const { commits } = await scope.forge.listPullRequestCommits(scope.call);
  return commits.find((c) => c.sha === sha) ?? null;
}

/** The 404 of the three commit routes. */
function commitNotFound(): NextResponse {
  return NextResponse.json({ error: "Commit not found in this pull request" }, { status: 404 });
}

/**
 * The diff of one PR commit, in the same shape as the PR diff (`files` and
 * patches) so the same diff view renders it.
 */
export async function prCommitDiffResponse(
  scope: PrScope,
  sha: string,
): Promise<NextResponse> {
  try {
    const commit = await resolvePrCommit(scope, sha);
    if (!commit) return commitNotFound();
    const diff = await scope.forge.getCommitDiff({
      token: scope.call.token,
      repoFullName: scope.call.repoFullName,
      sha: commit.sha,
    });
    return NextResponse.json({
      ...diff,
      message: commit.message,
      author: commit.author,
      authorName: commit.authorName,
      authoredAt: commit.authoredAt,
      provider: scope.target.provider,
    });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * A file of a commit's diff as it was before the commit, for expanding
 * context in that commit's diff view.
 *
 * The ref is the commit's parent, not the PR's merge base (unlike
 * `prFileSourceResponse`): expanding from the merge base would insert lines
 * from before every other commit, real code in the wrong place.
 */
export async function prCommitFileSourceResponse(
  scope: PrScope,
  sha: string,
  path: string,
): Promise<NextResponse> {
  try {
    const commit = await resolvePrCommit(scope, sha);
    if (!commit) return commitNotFound();

    const diff = await scope.forge.getCommitDiff({
      token: scope.call.token,
      repoFullName: scope.call.repoFullName,
      sha: commit.sha,
    });
    // A file added BY this commit has no previous version: its patch IS
    // already the whole file.
    const file = diff.files.find((f) => basePathOf(f) === path);
    if (!file || file.status === "added") {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }
    const parent = diff.parentSha ?? commit.parentSha;
    if (!parent) {
      return NextResponse.json({ error: "Commit has no parent" }, { status: 409 });
    }

    const content = await scope.forge.getFileAtRef({
      token: scope.call.token,
      repoFullName: scope.call.repoFullName,
      path,
      ref: parent,
    });
    if (content === null) {
      return NextResponse.json({ error: "File not found at parent commit" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Bytes of a file of a commit's diff (images), the counterpart of
 * `prFileBytesResponse` at this commit's two refs: its parent and itself.
 * Same three guards, in the same order.
 */
export async function prCommitFileBytesResponse(
  scope: PrScope,
  sha: string,
  filename: string,
  side: FileSide,
): Promise<NextResponse> {
  const contentType = imageMimeType(filename);
  if (!contentType) {
    return NextResponse.json({ error: "Not a previewable image" }, { status: 415 });
  }

  try {
    const commit = await resolvePrCommit(scope, sha);
    if (!commit) return commitNotFound();

    const diff = await scope.forge.getCommitDiff({
      token: scope.call.token,
      repoFullName: scope.call.repoFullName,
      sha: commit.sha,
    });
    const file = diff.files.find((f) => f.filename === filename);
    if (!file) {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }
    if (side === "base" && file.status === "added") {
      return NextResponse.json({ error: "File has no base version" }, { status: 404 });
    }
    if (side === "head" && file.status === "removed") {
      return NextResponse.json({ error: "File has no head version" }, { status: 404 });
    }

    const parent = diff.parentSha ?? commit.parentSha;
    if (side === "base" && !parent) {
      return NextResponse.json({ error: "Commit has no parent" }, { status: 409 });
    }
    const bytes = await scope.forge.getFileBytesAtRef({
      token: scope.call.token,
      repoFullName: scope.call.repoFullName,
      path: side === "base" ? basePathOf(file) : file.filename,
      // The two refs are SHA: the response is cacheable (see imageBytesResponse).
      ref: side === "base" ? (parent as string) : commit.sha,
    });
    if (bytes === null) {
      return NextResponse.json({ error: "File not found at this ref" }, { status: 404 });
    }
    return imageBytesResponse(bytes, contentType);
  } catch (err) {
    return forgeErrorResponse(err);
  }
}
