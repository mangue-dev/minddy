import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Remplace l'ensemble des catégories d'un post de feedback (MIN-52) — full
 * replace : les ids non envoyés sont retirés. Ne garde que les catégories qui
 * appartiennent au projet du post. Pas de journal d'activité (contrairement aux
 * issues) : le jeu de catégories est directement visible sur le post.
 *
 * L'accès est vérifié par la route appelante (requireProjectMember +
 * getProjectFeedbackPost) ; ce cœur suppose (projectId, postId) déjà validés.
 */
export type SetFeedbackCategoriesResult =
  | { ok: true; categoryIds: string[] }
  | { ok: false; status: number; errorKey: "databaseError" };

export async function setFeedbackPostCategories({
  projectId,
  postId,
  categoryIds,
}: {
  projectId: string;
  postId: string;
  categoryIds: string[];
}): Promise<SetFeedbackCategoriesResult> {
  const requested = categoryIds.filter((v): v is string => typeof v === "string");
  const service = getServiceClient();

  // On ne garde que les catégories qui existent dans le projet du post.
  let valid: string[] = [];
  if (requested.length > 0) {
    const { data: cats } = await service
      .from("categories")
      .select("id")
      .eq("project_id", projectId)
      .in("id", requested);
    valid = (cats ?? []).map((c) => c.id as string);
  }

  const { error: delError } = await service
    .from("feedback_post_categories")
    .delete()
    .eq("post_id", postId);
  if (delError) {
    console.error("[feedback-categories] clear failed:", delError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  if (valid.length > 0) {
    // upsert + ignoreDuplicates : tolère une requête concurrente ayant déjà
    // inséré la même paire (post_id, category_id) — pas de 500 sur la PK.
    const { error: insError } = await service
      .from("feedback_post_categories")
      .upsert(valid.map((category_id) => ({ post_id: postId, category_id })), {
        onConflict: "post_id,category_id",
        ignoreDuplicates: true,
      });
    if (insError) {
      console.error("[feedback-categories] set failed:", insError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  return { ok: true, categoryIds: valid };
}
