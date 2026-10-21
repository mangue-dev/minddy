import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { isHiddenFeedbackStatus, type FeedbackPostStatus } from "@/lib/feedback/types";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Votes (MIN-37) — 1 identity = 1 vote on a post. Denormalized counters
 * are maintained by SQL triggers; here we only touch the voting lines.
 *
 * `projectId` is not optional, and that's the point (MIN-342): a visitor identity
 * is BY PROJECT (`feedback_users.project_id`), so a post is never resolved by its own id — it resolves IN the visitor's project.
 * Without this filter, a visitor identified on a board votes on the feedback from
 * any other.
 *
 * A board visitor may only vote on a post they can still READ (MIN-715): one
 * that is public, published and not spam, or one they wrote themselves. The
 * check runs at write time, so a card left open after the team made the post
 * private (or sent it back to review, or marked it spam) no longer adds
 * support, and neither does replaying the action with a known id. The
 * integration API is the exception: its key acts for the whole project, which
 * already sees every post, so it keeps voting on any non-merged post.
 */

export async function votePost(params: {
  postId: string;
  userId: string;
  projectId: string;
  /** Set only by the authenticated integration API, never by the public board. */
  trustedIntegration?: boolean;
}): Promise<boolean> {
  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id, author_id, is_public, review_state, status")
    .is("deleted_at", null)
    .eq("id", params.postId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) return false;
  if (!params.trustedIntegration) {
    const publiclyVisible =
      post.is_public === true &&
      post.review_state === "published" &&
      !isHiddenFeedbackStatus(post.status as FeedbackPostStatus);
    if (!publiclyVisible && post.author_id !== params.userId) return false;
  }

  const { error } = await service
    .from("feedback_votes")
    .upsert(
      { post_id: params.postId, user_id: params.userId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  if (!error) {
    captureServerEvent({
      distinctId: params.userId,
      event: "public_feedback_voted",
      properties: { voted: true },
    });
  }
  return !error;
}

/** Withdraw your voice. No `projectId` here, and this is not an oversight: the
 deletion is filtered on `user_id`, an identity that ONLY exists in
 his project — on one post moreover, it does not match any lines. */
export async function unvotePost(params: { postId: string; userId: string }): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_votes")
    .delete()
    .eq("post_id", params.postId)
    .eq("user_id", params.userId);
  if (!error) {
    captureServerEvent({
      distinctId: params.userId,
      event: "public_feedback_voted",
      properties: { voted: false },
    });
  }
  return !error;
}
