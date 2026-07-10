import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Merge/undo (MIN-37) — wrappers TS des fonctions Postgres. Toute l'atomicité
 * (locks ordonnés, union des votes par identité, aplatissement des chaînes,
 * payload d'undo) vit en SQL : supabase-js n'a pas de transactions client.
 * L'IA (passe horaire) et l'équipe (onglet feedback) appellent les mêmes RPC.
 */

export type MergeResult = { ok: true; eventId: string } | { ok: false; error: string };

export async function mergePosts(params: {
  dupId: string;
  canonicalId: string;
  performedBy: "ai" | "team";
  actorId?: string | null;
  confidence?: number | null;
}): Promise<MergeResult> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("merge_feedback_posts", {
    p_dup: params.dupId,
    p_canonical: params.canonicalId,
    p_performed_by: params.performedBy,
    p_actor: params.actorId ?? null,
    p_confidence: params.confidence ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, eventId: data as string };
}

export async function mergeFacets(params: {
  dupId: string;
  canonicalId: string;
  performedBy: "ai" | "team";
  actorId?: string | null;
  confidence?: number | null;
}): Promise<MergeResult> {
  const service = getServiceClient();
  const { data, error } = await service.rpc("merge_feedback_facets", {
    p_dup: params.dupId,
    p_canonical: params.canonicalId,
    p_performed_by: params.performedBy,
    p_actor: params.actorId ?? null,
    p_confidence: params.confidence ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, eventId: data as string };
}

export async function undoMerge(params: {
  eventId: string;
  actorId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = getServiceClient();
  const { error } = await service.rpc("undo_feedback_merge", {
    p_event: params.eventId,
    p_actor: params.actorId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Rejet d'une suggestion IA : la paire est mémorisée pour que l'analyseur ne
    la re-propose jamais (dans les deux sens), puis la suggestion s'efface. */
export async function rejectMergeSuggestion(params: {
  postId: string;
  actorId?: string | null;
}): Promise<boolean> {
  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, suggested_merge_into_id")
    .eq("id", params.postId)
    .maybeSingle();
  if (!post?.suggested_merge_into_id) return false;

  await service.from("feedback_merge_rejections").upsert(
    {
      dup_id: post.id as string,
      canonical_id: post.suggested_merge_into_id as string,
      project_id: post.project_id as string,
      kind: "post",
      rejected_by: params.actorId ?? null,
    },
    { onConflict: "dup_id,canonical_id", ignoreDuplicates: true }
  );

  const { error } = await service
    .from("feedback_posts")
    .update({ suggested_merge_into_id: null, suggested_confidence: null })
    .eq("id", params.postId);
  return !error;
}
