import "server-only";

import { groupReviewThreads } from "@/lib/pr-review-threads";
import type { Forge } from "@/lib/server/agent/forge";
import { MAX_PATCH_CHARS } from "@/lib/server/mcp/surface-limits";

type ForgeResult<K extends keyof Forge> = Forge[K] extends (...args: never[]) => Promise<infer R> ? R : never;
type PullRequestFile = ForgeResult<"listPullRequestFiles">["files"][number];
type ReviewComment = ForgeResult<"listPullRequestReviewComments">[number];

/**
 * A pull request as an agent reads it, from the forge: the PR, its files, its
 * review threads with their resolution (MIN-139), its CI checks (MIN-138)
 * and, when asked, its conversation comments (MIN-550). Shared by Numo's
 * read_pull_request and the MCP's minddy_get_pull_request; the caller has
 * already scoped the PR to the project's linked repository.
 *
 * The PR and its files must be readable; everything else is best-effort. An
 * unreadable list comes back empty and unreadable checks come back `null`
 * (App permission not accepted, repository without CI), never as an error.
 */
export async function readPullRequestFromForge(
  forge: Forge,
  target: { token: string; repoFullName: string },
  number: number,
  options: { conversation: boolean },
) {
  const pr = { token: target.token, repoFullName: target.repoFullName, number };
  const [pullRequest, diff, reviewComments, reviewThreads, conversation] = await Promise.all([
    forge.getPullRequest(pr),
    forge.listPullRequestFiles(pr),
    forge.listPullRequestReviewComments(pr).catch(() => []),
    forge.listReviewThreads(pr).catch(() => []),
    options.conversation ? forge.listPullRequestComments(pr).catch(() => []) : Promise.resolve([]),
  ]);
  const checks = pullRequest.headSha
    ? await forge.listChecks({ ...pr, sha: pullRequest.headSha }).catch(() => null)
    : null;
  return {
    pullRequest,
    files: diff.files,
    /** The forge's pagination cut the list: say so rather than let the agent conclude from what it saw. */
    filesTruncated: diff.truncated,
    threads: groupReviewThreads(reviewComments, reviewThreads),
    conversation,
    checks,
  };
}

export type PullRequestRead = Awaited<ReturnType<typeof readPullRequestFromForge>>;

export function pullRequestFileView(f: PullRequestFile) {
  return {
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    // A big diff would drown the model's context.
    patch:
      f.patch && f.patch.length > MAX_PATCH_CHARS
        ? f.patch.slice(0, MAX_PATCH_CHARS) + "\n… (diff truncated)"
        : (f.patch ?? null),
  };
}

/**
 * A review thread anchored to the code. `id` is the thread's ROOT comment,
 * which the thread tools address. `line: null` means the code it pointed at
 * has changed since: only `diff_hunk` still says what it was about.
 */
export function reviewThreadView(thread: PullRequestRead["threads"][number], options: { withUrl: boolean }) {
  return {
    id: thread.id,
    path: thread.root.path,
    line: thread.root.line,
    original_line: thread.root.original_line,
    side: thread.root.side,
    // First line of a multi-line remark (`line` is the last): without it,
    // "these ten lines are wrong" reads as a remark on the last one (MIN-181).
    start_line: thread.root.start_line,
    original_start_line: thread.root.original_start_line,
    outdated: thread.resolution?.outdated ?? thread.root.line == null,
    // `false` also covers "the forge did not say".
    resolved: !!thread.resolution?.resolved,
    diff_hunk: thread.root.diff_hunk,
    ...(options.withUrl ? { url: thread.root.html_url } : {}),
    comments: thread.comments.map((c: ReviewComment) => ({
      author: c.user?.login ?? null,
      body: c.body,
      created_at: c.created_at,
    })),
  };
}

export function pullRequestState(pr: PullRequestRead["pullRequest"]): string {
  return pr.merged ? "merged" : pr.state;
}
