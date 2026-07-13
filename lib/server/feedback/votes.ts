import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Votes (MIN-37) — 1 identité = 1 voix sur un post. Les compteurs dénormalisés
 * sont maintenus par triggers SQL ; ici on ne touche que les lignes de votes.
 */

export async function votePost(params: { postId: string; userId: string }): Promise<boolean> {
  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id")
    .eq("id", params.postId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) return false;

  const { error } = await service
    .from("feedback_votes")
    .upsert(
      { post_id: params.postId, user_id: params.userId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  return !error;
}

export async function unvotePost(params: { postId: string; userId: string }): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_votes")
    .delete()
    .eq("post_id", params.postId)
    .eq("user_id", params.userId);
  return !error;
}
