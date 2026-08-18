import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Votes (MIN-37) — 1 identity = 1 vote on a post. Denormalized counters
 * are maintained by SQL triggers; here we only touch the voting lines.
 *
 * `projectId` is not optional, and that's the point (MIN-342): a visitor identity
 * is BY PROJECT (`feedback_users.project_id`), so a post is never resolved by its own id — it resolves IN the visitor's project.
 * Without this filter, a visitor identified on a board votes on the feedback from
 * any other.
 */

export async function votePost(params: {
  postId: string;
  userId: string;
  projectId: string;
}): Promise<boolean> {
  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id")
    .is("deleted_at", null)
    .eq("id", params.postId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) return false;

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
