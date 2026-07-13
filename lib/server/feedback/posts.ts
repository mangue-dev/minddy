import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { embedText, toVectorLiteral } from "@/lib/server/embeddings";
import type { FeedbackPostSource, FeedbackPostStatus } from "@/lib/feedback/types";

/**
 * Création des posts de feedback (MIN-37) — core partagé des trois canaux
 * (board public, API serveur-à-serveur, saisie interne). Double couche :
 * title/body = canonique éditable équipe ; submitted_* = brut sacré, écrit ici
 * une seule fois. L'embedding est calculé en best-effort AVANT l'insert
 * (timeout court) : tout échec insère embedding=null et la passe horaire
 * rattrape — la réponse ne dépend jamais de l'IA.
 */

export const FEEDBACK_TITLE_MAX = 200;
export const FEEDBACK_BODY_MAX = 10_000;
const EMBED_TIMEOUT_MS = 2500;

export interface FeedbackPostRow {
  id: string;
  project_id: string;
  author_id: string | null;
  created_by_member: string | null;
  title: string;
  body: string;
  submitted_title: string;
  submitted_body: string;
  status: FeedbackPostStatus;
  is_public: boolean;
  vote_count: number;
  issue_id: string | null;
  merged_into_id: string | null;
  suggested_merge_into_id: string | null;
  suggested_confidence: number | null;
  source: FeedbackPostSource;
  analyzed_at: string | null;
  team_response: string | null;
  team_response_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Colonnes rendues aux appelants — jamais l'embedding (payload inutile). */
export const FEEDBACK_POST_SELECT =
  "id, project_id, author_id, created_by_member, title, body, submitted_title, submitted_body, status, is_public, vote_count, issue_id, merged_into_id, suggested_merge_into_id, suggested_confidence, source, analyzed_at, team_response, team_response_at, created_at, updated_at";

export type CreateFeedbackPostResult =
  | { ok: true; post: FeedbackPostRow }
  | { ok: false; status: number; errorKey: "titleRequired" | "databaseError" };

export async function createFeedbackPost(input: {
  projectId: string;
  title: string;
  body?: string | null;
  source: FeedbackPostSource;
  /** Identité de l'auteur (feedback_users.id). Null uniquement pour les posts
      créés par l'équipe elle-même sans auteur rattaché. */
  authorId: string | null;
  /** Membre qui a saisi le feedback (canal interne uniquement). */
  createdByMember?: string | null;
  /** false = retour privé : collecté par l'équipe mais jamais publié sur le
      board. Par défaut public (choix explicite du visiteur au composeur). */
  isPublic?: boolean;
}): Promise<CreateFeedbackPostResult> {
  const service = getServiceClient();
  const title = input.title.trim().slice(0, FEEDBACK_TITLE_MAX);
  const body = (input.body ?? "").trim().slice(0, FEEDBACK_BODY_MAX);
  if (!title) return { ok: false, status: 400, errorKey: "titleRequired" };

  const embedding = await embedText(body ? `${title}\n\n${body}` : title, {
    timeoutMs: EMBED_TIMEOUT_MS,
  });

  const { data, error } = await service
    .from("feedback_posts")
    .insert({
      project_id: input.projectId,
      author_id: input.authorId,
      created_by_member: input.createdByMember ?? null,
      title,
      body,
      submitted_title: title,
      submitted_body: body,
      is_public: input.isPublic ?? true,
      source: input.source,
      embedding: embedding ? toVectorLiteral(embedding) : null,
    })
    .select(FEEDBACK_POST_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[feedback-posts] insert failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const post = data as FeedbackPostRow;
  if (!input.authorId) return { ok: true, post };

  // Soumettre = voter : l'auteur soutient évidemment son propre besoin.
  await service
    .from("feedback_votes")
    .upsert(
      { post_id: post.id, user_id: input.authorId },
      { onConflict: "post_id,user_id", ignoreDuplicates: true }
    );

  return { ok: true, post: { ...post, vote_count: post.vote_count + 1 } };
}

/** Lit un post par id (sans embedding). */
export async function getFeedbackPost(postId: string): Promise<FeedbackPostRow | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(FEEDBACK_POST_SELECT)
    .eq("id", postId)
    .maybeSingle();
  return (data as FeedbackPostRow | null) ?? null;
}
