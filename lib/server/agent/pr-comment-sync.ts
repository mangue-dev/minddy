import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { findSyncedThreadRoot, finishSyncedForgeComment } from "@/lib/server/comment-store";
import { mirrorGithubCommentToIssue } from "@/lib/server/git/issue-sync";
import { issueStore } from "@/lib/server/issue-store";
import {
  mirroredCommentBody,
  mirrorFromGithubConversationComment,
  mirrorFromGithubReview,
  mirrorFromGithubReviewComment,
  mirrorFromGitlabNote,
  type MirrorForge,
  type PrCommentMirror,
} from "@/lib/pr-comment-mirror";
import { repoWriteActor } from "./pr-activity";
import { listPullRequestMirrorSources } from "./pr";
import { listMergeRequestMirrorSources } from "./mr";
import {
  findPullRequestByNumber,
  pullRequestIssueIds,
  rowProvider,
  type PullRequestRow,
} from "./pull-requests";
import { resolveRepoCloneTarget } from "./repo-access";

/**
 * PR → ticket comment mirror (MIN-802): what is written on a linked pull
 * request (GitHub) or merge request (GitLab) also reads on its ticket, and
 * follows its edits, deletions and reply threads. The rules of WHAT lands live
 * in `lib/pr-comment-mirror`; this module decides WHERE, and writes through
 * the same sidecar as mirrored issue comments (`mirrorGithubCommentToIssue`).
 *
 * The row's author is the member who linked the repository to the ticket's
 * project — the same technical actor as the status sync (`repoWriteActor`);
 * the timeline credits the forge author. A ticket in a project that does not
 * link the repository has no such member, and receives nothing.
 *
 * No notification, like mirrored issue comments: the forge already notified
 * the people involved, and the PR activity line still tells the ticket.
 */

/**
 * Writes one mirrored comment to one ticket. Where it lands in its thread is
 * decided BEFORE the write: a thread root carries the code header, a reply
 * only its text.
 */
async function mirrorPrCommentToIssue(opts: {
  issueId: string;
  pr: PullRequestRow;
  mirror: PrCommentMirror;
}): Promise<void> {
  const { issueId, pr, mirror } = opts;
  const authorId = await repoWriteActor({
    provider: rowProvider(pr),
    repoFullName: pr.repo_full_name,
    issueId,
  });
  if (!authorId) return;
  const service = getServiceClient();
  const parentCommentId = await findSyncedThreadRoot(service, {
    issueId,
    remoteCommentId: mirror.remoteCommentId,
    threadKey: mirror.threadKey,
    replyToRemoteCommentId: mirror.replyToRemoteCommentId,
    createdAt: mirror.createdAt,
  });
  const commentId = await mirrorGithubCommentToIssue({
    issueId,
    authorId,
    comment: { ...mirror, body: mirroredCommentBody(mirror, !!parentCommentId) },
  });
  if (!commentId) return;
  await finishSyncedForgeComment(service, {
    issueId,
    commentId,
    remoteCommentId: mirror.remoteCommentId,
    provider: mirror.provider,
    pullRequestId: pr.id,
    threadKey: mirror.threadKey,
    parentCommentId: mirror.action === "deleted" ? null : parentCommentId,
  });
}

/**
 * Fans one PR comment out to every ticket linked to its pull request. A PR
 * without a linked ticket is normal (a human PR minddy does not track).
 *
 * Best effort per ticket, like the rest of the webhook path: one ticket that
 * fails never keeps the comment from the others, and never fails the delivery.
 */
export async function syncPrCommentToIssues(opts: {
  provider: MirrorForge;
  repoFullName: string;
  prNumber: number;
  mirror: PrCommentMirror | null;
}): Promise<void> {
  if (!opts.mirror) return;
  try {
    const pr = await findPullRequestByNumber({
      provider: opts.provider,
      repoFullName: opts.repoFullName,
      number: opts.prNumber,
    });
    if (!pr) return;
    for (const issueId of await pullRequestIssueIds(pr.id)) {
      try {
        await mirrorPrCommentToIssue({ issueId, pr, mirror: opts.mirror });
      } catch {
        console.error("[pr-comment-sync] issue_mirror_failed");
      }
    }
  } catch {
    console.error("[pr-comment-sync] pr_lookup_failed");
  }
}

/** Everything a PR already carries in writing, as mirrors, oldest first. */
async function readPrMirrors(pr: PullRequestRow, token: string): Promise<PrCommentMirror[]> {
  const call = { token, repoFullName: pr.repo_full_name, number: pr.number };
  const mirrors = rowProvider(pr) === "gitlab"
    ? (await listMergeRequestMirrorSources(call)).map((note) => mirrorFromGitlabNote(note, "created"))
    : await listPullRequestMirrorSources(call).then((sources) => [
        ...sources.reviews.map((review) => mirrorFromGithubReview(review, "created")),
        ...sources.comments.map((comment) => mirrorFromGithubConversationComment(comment, "created")),
        ...sources.reviewComments.map((comment) => mirrorFromGithubReviewComment(comment, "created")),
      ]);
  return mirrors
    .filter((mirror): mirror is PrCommentMirror => !!mirror)
    // Normalized ISO instants order as strings; the sort is stable, so a
    // thread root read before its replies stays first on a tie.
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
}

/**
 * Imports what a pull request already carries into one ticket. Replaying is
 * safe: the sidecar key makes an already mirrored comment an update, and a
 * stale copy is skipped. Each comment keeps the date it was written at, even
 * when that is before the ticket existed.
 */
async function backfillPrCommentsToIssue(pr: PullRequestRow, issueId: string): Promise<void> {
  const { data: issue, error } = await issueStore(getServiceClient()).select("project_id")
    .eq("id", issueId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error("pr_comment_backfill_issue_unreadable");
  const projectId = (issue as { project_id?: string } | null)?.project_id;
  if (!projectId) return;
  const target = await resolveRepoCloneTarget(projectId);
  if (!target || target.provider !== rowProvider(pr)) return;
  for (const mirror of await readPrMirrors(pr, target.token)) {
    try {
      await mirrorPrCommentToIssue({ issueId, pr, mirror });
    } catch {
      console.error("[pr-comment-sync] backfill_mirror_failed");
    }
  }
}

/**
 * Imports a PR's past comments into every ticket linked to it since the last
 * import — however the link was made: by hand, or automatically when a branch,
 * title or closing line names the ticket, possibly days into the discussion.
 *
 * Each link is CLAIMED (`comments_backfilled_at`) before the forge read, so two
 * deliveries of the same PR event never import twice; a failed read releases
 * the claim so the next PR event retries. Called off the response path.
 */
export async function backfillPendingPrComments(pr: PullRequestRow): Promise<void> {
  const service = getServiceClient();
  const { data: pending, error } = await service.from("pull_request_issues")
    .select("issue_id").eq("pull_request_id", pr.id).is("comments_backfilled_at", null);
  if (error) {
    console.error("[pr-comment-sync] pending_links_unreadable");
    return;
  }
  for (const { issue_id: issueId } of (pending ?? []) as { issue_id: string }[]) {
    const { data: claimed, error: claimError } = await service.from("pull_request_issues")
      .update({ comments_backfilled_at: new Date().toISOString() })
      .eq("pull_request_id", pr.id).eq("issue_id", issueId).is("comments_backfilled_at", null)
      .select("issue_id");
    if (claimError || !claimed?.length) continue;
    try {
      await backfillPrCommentsToIssue(pr, issueId);
    } catch {
      console.error("[pr-comment-sync] backfill_failed");
      await service.from("pull_request_issues").update({ comments_backfilled_at: null })
        .eq("pull_request_id", pr.id).eq("issue_id", issueId);
    }
  }
}
