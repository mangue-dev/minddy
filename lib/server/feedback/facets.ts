import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { embedText, toVectorLiteral } from "@/lib/server/embeddings";
import type { FeedbackFacetSource } from "@/lib/feedback/types";

/**
 * Facettes (MIN-37) — la contribution structurée qui remplace les commentaires.
 * Une facette utilisateur garde sa formulation brute (submitted_text, sacrée) ;
 * text est la version canonique éditable par l'équipe. Ajouter une facette =
 * vote implicite sur la racine + vote sur sa propre facette. Les facettes
 * user passent ensuite par la passe IA horaire (dédup, validation
 * racine-vs-facette).
 */

export const FACET_TEXT_MAX = 200;
const EMBED_TIMEOUT_MS = 2500;

export interface FeedbackFacetRow {
  id: string;
  post_id: string;
  text: string;
  submitted_text: string | null;
  vote_count: number;
  source: FeedbackFacetSource;
  merged_into_id: string | null;
  review_flag: "root_disguised" | null;
  created_by: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const FEEDBACK_FACET_SELECT =
  "id, post_id, text, submitted_text, vote_count, source, merged_into_id, review_flag, created_by, analyzed_at, created_at, updated_at";

export type AddFacetResult =
  | { ok: true; facet: FeedbackFacetRow }
  | { ok: false; status: number; errorKey: "titleRequired" | "issueNotFound" | "databaseError" };

/** Facette ajoutée par un utilisateur final depuis le board public. */
export async function addUserFacet(params: {
  postId: string;
  userId: string;
  text: string;
}): Promise<AddFacetResult> {
  const service = getServiceClient();
  const text = params.text.trim().slice(0, FACET_TEXT_MAX);
  if (!text) return { ok: false, status: 400, errorKey: "titleRequired" };

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id")
    .eq("id", params.postId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const embedding = await embedText(text, { timeoutMs: EMBED_TIMEOUT_MS });

  const { data, error } = await service
    .from("feedback_facets")
    .insert({
      post_id: params.postId,
      text,
      submitted_text: text,
      source: "user",
      created_by: params.userId,
      embedding: embedding ? toVectorLiteral(embedding) : null,
    })
    .select(FEEDBACK_FACET_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[feedback-facets] insert failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const facet = data as FeedbackFacetRow;

  // Provenance : ce post soutient cette facette (ici, son post d'origine).
  await service
    .from("feedback_facet_sources")
    .upsert(
      { facet_id: facet.id, post_id: params.postId },
      { onConflict: "facet_id,post_id", ignoreDuplicates: true }
    );

  // Ajouter une facette = vote implicite sur la racine + sur sa facette.
  await service
    .from("feedback_votes")
    .upsert(
      { post_id: params.postId, user_id: params.userId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );
  await service
    .from("feedback_facet_votes")
    .upsert(
      { facet_id: facet.id, user_id: params.userId },
      { onConflict: "facet_id,user_id", ignoreDuplicates: true }
    );

  return { ok: true, facet: { ...facet, vote_count: facet.vote_count + 1 } };
}

/** Facette ajoutée/curée par l'équipe (pas de vote implicite : l'équipe
    structure, elle ne vote pas). */
export async function addTeamFacet(params: {
  postId: string;
  text: string;
}): Promise<AddFacetResult> {
  const service = getServiceClient();
  const text = params.text.trim().slice(0, FACET_TEXT_MAX);
  if (!text) return { ok: false, status: 400, errorKey: "titleRequired" };

  const { data: post } = await service
    .from("feedback_posts")
    .select("id, merged_into_id")
    .eq("id", params.postId)
    .maybeSingle();
  if (!post || post.merged_into_id !== null) {
    return { ok: false, status: 404, errorKey: "issueNotFound" };
  }

  const embedding = await embedText(text, { timeoutMs: EMBED_TIMEOUT_MS });
  const { data, error } = await service
    .from("feedback_facets")
    .insert({
      post_id: params.postId,
      text,
      source: "team",
      analyzed_at: new Date().toISOString(),
      embedding: embedding ? toVectorLiteral(embedding) : null,
    })
    .select(FEEDBACK_FACET_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[feedback-facets] team insert failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, facet: data as FeedbackFacetRow };
}

/** Renommage par l'équipe — ne touche jamais submitted_text (brut sacré). */
export async function renameFacet(params: {
  facetId: string;
  text: string;
}): Promise<FeedbackFacetRow | null> {
  const service = getServiceClient();
  const text = params.text.trim().slice(0, FACET_TEXT_MAX);
  if (!text) return null;
  const embedding = await embedText(text, { timeoutMs: EMBED_TIMEOUT_MS });
  const { data } = await service
    .from("feedback_facets")
    .update({
      text,
      ...(embedding ? { embedding: toVectorLiteral(embedding) } : {}),
      review_flag: null,
    })
    .eq("id", params.facetId)
    .select(FEEDBACK_FACET_SELECT)
    .maybeSingle();
  return (data as FeedbackFacetRow | null) ?? null;
}

export async function deleteFacet(facetId: string): Promise<boolean> {
  const service = getServiceClient();
  const { error } = await service.from("feedback_facets").delete().eq("id", facetId);
  return !error;
}

/** Conversion facette → post (une « racine déguisée ») : nouveau post portant
    le texte de la facette, les voteurs de la facette deviennent voteurs du
    post, la facette disparaît. Réservé à l'équipe. */
export async function convertFacetToPost(params: {
  facetId: string;
  actorId: string;
}): Promise<{ ok: true; postId: string } | { ok: false }> {
  const service = getServiceClient();
  const { data: facet } = await service
    .from("feedback_facets")
    .select("id, post_id, text, submitted_text, created_by, merged_into_id")
    .eq("id", params.facetId)
    .maybeSingle();
  if (!facet || facet.merged_into_id !== null) return { ok: false };

  const { data: origin } = await service
    .from("feedback_posts")
    .select("id, project_id")
    .eq("id", facet.post_id as string)
    .maybeSingle();
  if (!origin) return { ok: false };

  // Import différé pour éviter le cycle facets ⇄ posts au chargement.
  const { createFeedbackPost } = await import("@/lib/server/feedback/posts");
  const created = await createFeedbackPost({
    projectId: origin.project_id as string,
    title: (facet.submitted_text as string | null) ?? (facet.text as string),
    body: "",
    source: "internal",
    authorId: (facet.created_by as string | null) ?? null,
    createdByMember: params.actorId,
  });
  if (!created.ok) return { ok: false };

  // Les voteurs de la facette soutenaient ce besoin : ils suivent.
  const { data: voters } = await service
    .from("feedback_facet_votes")
    .select("user_id")
    .eq("facet_id", params.facetId);
  for (const voter of voters ?? []) {
    await service
      .from("feedback_votes")
      .upsert(
        { post_id: created.post.id, user_id: voter.user_id as string },
        { onConflict: "post_id,user_id", ignoreDuplicates: true }
      );
  }

  await service.from("feedback_facets").delete().eq("id", params.facetId);
  return { ok: true, postId: created.post.id };
}
