import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { captureServerEvent } from "@/lib/server/posthog";

/**
 * Votes (MIN-37) — 1 identité = 1 voix sur un post. Les compteurs dénormalisés
 * sont maintenus par triggers SQL ; ici on ne touche que les lignes de votes.
 *
 * `projectId` n'est pas optionnel, et c'est le point (MIN-342) : une identité
 * de visiteur est PAR PROJET (`feedback_users.project_id`), donc un post ne se
 * résout jamais par son seul id — il se résout DANS le projet du visiteur.
 * Sans ce filtre, un visiteur identifié sur un board vote sur les retours de
 * n'importe quel autre.
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

/** Retirer sa voix. Pas de `projectId` ici, et ce n'est pas un oubli : la
    suppression est filtrée sur `user_id`, une identité qui n'existe QUE dans
    son projet — sur un post d'ailleurs, elle ne matche aucune ligne. */
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
