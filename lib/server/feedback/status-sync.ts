import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import type { FeedbackPostStatus } from "@/lib/feedback/types";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Reflection of the status of a linked issue on its feedback post (MIN-37).
 *
 * The table is TOTAL on the issue statuses, and that's the whole point: linking a
 * ticket to a return is declaring that one says the other. A partial table
 * made them TRIGGERS — only done, in_progress, in_review and canceled
 * wrote, the other transitions did nothing. A ticket passed "in
 * in progress" then returned to the backlog therefore left its return "In progress": the
 * public board announced work started that no one was doing anymore, and
 * nothing in the screen allowed it to be corrected, the status of a linked return
 * being read-only. A link that only holds one way is not a
 * link.
 *
 * Two readings are worth saying:
 *
 * - **backlog → `open`**, not “planned”. A backlog ticket is not
 * scheduled, it is received; it's `todo` which is a promise. Promoting a
 * return no longer automatically makes it “Planned” — it becomes so when
 * his ticket is really taken.
 * - **duplicate → `open`**. The outcome is a duplicate, but the need is still alive and followed elsewhere. "Declined" would tell the audience that we have
 * said no, which is false.
 *
 * Plugged into updateIssueFields — the chokepoint of all mutation paths — and executed via after(), never on the response path.
 */
export const ISSUE_TO_FEEDBACK_STATUS: Record<IssueStatus, FeedbackPostStatus> = {
  triage: "open",
  backlog: "open",
  todo: "planned",
  in_progress: "in_progress",
  in_review: "in_progress",
  done: "shipped",
  canceled: "declined",
  duplicate: "open",
};

/** The public status that an issue-related return carries in this state. */
export function feedbackStatusForIssue(
  issueStatus: unknown
): FeedbackPostStatus | null {
  return typeof issueStatus === "string" &&
    Object.hasOwn(ISSUE_TO_FEEDBACK_STATUS, issueStatus)
    ? ISSUE_TO_FEEDBACK_STATUS[issueStatus as IssueStatus]
    : null;
}

export function scheduleFeedbackStatusSync(
  issueId: string,
  issueStatus: unknown,
  actorId: string | null = null
): void {
  // `null` only for a value that is not a known status — not for
  // un statut qu'on aurait choisi d'ignorer : il n'y en a plus.
  const mapped = feedbackStatusForIssue(issueStatus);
  if (!mapped) return;
  afterOrNow(() =>
    syncFeedbackStatusForIssue(issueId, mapped, actorId).catch((e) =>
      console.error("[feedback-status-sync] failed:", (e as Error).message)
    )
  );
}

export async function syncFeedbackStatusForIssue(
  issueId: string,
  status: FeedbackPostStatus,
  actorId: string | null = null
): Promise<void> {
  const service = getServiceClient();
  // We read the posts that will really change to only log the ones
  // real transitions (from → to), attributed to the member who moved the outcome.
  const { data: affected } = await service
    .from("feedback_posts")
    .select("id, status")
    .is("deleted_at", null)
    .eq("issue_id", issueId)
    .neq("status", status);
  const { error } = await service
    .from("feedback_posts")
    .update({ status })
    .is("deleted_at", null)
    .eq("issue_id", issueId);
  if (error) {
    console.error("[feedback-status-sync] update failed:", error.message);
    return;
  }
  for (const post of affected ?? []) {
    await emitFeedbackFieldChanges(service, {
      postId: post.id as string,
      actorId,
      before: { status: post.status },
      updates: { status },
    });
  }
}
