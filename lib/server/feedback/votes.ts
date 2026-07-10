import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Votes (MIN-37) — 1 identité = 1 voix, sur un post comme sur une facette.
 * Les compteurs dénormalisés sont maintenus par triggers SQL ; ici on ne
 * touche que les lignes de votes en préservant deux invariants applicatifs :
 * voter une facette ⇒ vote implicite sur la racine, et retirer son vote
 * racine ⇒ retire aussi ses votes de facettes du post (voteurs-facette ⊆
 * voteurs-post, ce qui ferme l'algèbre du merge).
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

  // Invariant : plus de vote racine ⇒ plus de votes de facettes sur ce post.
  const { data: facets } = await service
    .from("feedback_facets")
    .select("id")
    .eq("post_id", params.postId);
  const facetIds = (facets ?? []).map((f) => f.id as string);
  if (facetIds.length > 0) {
    await service
      .from("feedback_facet_votes")
      .delete()
      .eq("user_id", params.userId)
      .in("facet_id", facetIds);
  }

  const { error } = await service
    .from("feedback_votes")
    .delete()
    .eq("post_id", params.postId)
    .eq("user_id", params.userId);
  return !error;
}

export async function voteFacet(params: { facetId: string; userId: string }): Promise<boolean> {
  const service = getServiceClient();
  const { data: facet } = await service
    .from("feedback_facets")
    .select("id, post_id, merged_into_id")
    .eq("id", params.facetId)
    .maybeSingle();
  if (!facet || facet.merged_into_id !== null) return false;

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id")
    .eq("id", facet.post_id as string)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) return false;

  // Vote implicite sur la racine d'abord (préserve l'invariant).
  await service
    .from("feedback_votes")
    .upsert(
      { post_id: facet.post_id as string, user_id: params.userId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );

  const { error } = await service
    .from("feedback_facet_votes")
    .upsert(
      { facet_id: params.facetId, user_id: params.userId },
      { onConflict: "facet_id,user_id", ignoreDuplicates: true }
    );
  return !error;
}

export async function unvoteFacet(params: { facetId: string; userId: string }): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_facet_votes")
    .delete()
    .eq("facet_id", params.facetId)
    .eq("user_id", params.userId);
  return !error;
}
