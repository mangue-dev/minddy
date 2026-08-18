import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Replaces all categories of a feedback post (MIN-52) — full
 * replace: unsent ids are removed. Only keeps categories that
 * belong to the post project. No activity log (unlike
 * issues): the set of categories is directly visible on the post.
 *
 * Access is checked by the calling route (requireProjectMember +
 * getProjectFeedbackPost); this core assumes (projectId, postId) already validated.
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

  // We only keep the categories that exist in the post project.
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
    // upsert + ignoreDuplicates: tolerates a concurrent request that already has
    // inserted the same pair (post_id, category_id) — no 500 on the PK.
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
