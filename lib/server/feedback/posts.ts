import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { embedText, toVectorLiteral } from "@/lib/server/embeddings";
import {
  isFeedbackReviewEnabled,
  reviewFeedbackPost,
} from "@/lib/server/feedback/review";
import {
  insertNotifications,
  projectMemberIds,
} from "@/lib/server/notifications";
import {
  emitFeedbackCreated,
  emitFeedbackFieldChanges,
} from "@/lib/server/feedback/events";
import {
  FEEDBACK_BODY_MAX,
  FEEDBACK_TITLE_MAX,
  isFeedbackPostStatus,
  isFeedbackReviewState,
  type FeedbackPostSource,
  type FeedbackPostStatus,
  type FeedbackReviewState,
} from "@/lib/feedback/types";
import { captureServerEvent } from "@/lib/server/posthog";
import { lengthBucket } from "@/lib/analytics-sanitize";

/**
 * Création des posts de feedback (MIN-37) — core partagé des trois canaux
 * (board public, API serveur-à-serveur, saisie interne). Double couche :
 * title/body = canonique éditable équipe ; submitted_* = brut sacré, écrit ici
 * une seule fois. L'embedding est calculé en best-effort AVANT l'insert
 * (timeout court) : tout échec insère embedding=null et la passe horaire
 * rattrape — la réponse ne dépend jamais de l'IA.
 */

// Réexportées : les appelants historiques (app/api/v1/feedback) les prennent
// ici, mais elles sont désormais définies en pur dans lib/feedback/types.ts.
export { FEEDBACK_TITLE_MAX, FEEDBACK_BODY_MAX };

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
  review_state: FeedbackReviewState;
  sensitivity: string | null;
  moderation_reason: string | null;
  classified_at: string | null;
  vote_count: number;
  issue_id: string | null;
  merged_into_id: string | null;
  suggested_merge_into_id: string | null;
  suggested_confidence: number | null;
  source: FeedbackPostSource;
  analyzed_at: string | null;
  /** Échecs consécutifs de la passe de revue — 3 = abandon (MIN-87). */
  analysis_failures: number;
  team_response: string | null;
  team_response_at: string | null;
  /** Langue du retour pris dans son ensemble, telle que la revue l'a lue. */
  source_language: string | null;
  /** Traduction dans la langue de l'équipe — à CÔTÉ du texte, jamais à sa
      place : le board public montre toujours le retour tel qu'il a été écrit. */
  translated_title: string | null;
  translated_body: string | null;
  translated_language: string | null;
  created_at: string;
  updated_at: string;
}

/** Colonnes rendues aux appelants — jamais l'embedding (payload inutile). */
export const FEEDBACK_POST_SELECT =
  "id, project_id, author_id, created_by_member, title, body, submitted_title, submitted_body, status, is_public, review_state, sensitivity, moderation_reason, classified_at, vote_count, issue_id, merged_into_id, suggested_merge_into_id, suggested_confidence, source, analyzed_at, analysis_failures, team_response, team_response_at, source_language, translated_title, translated_body, translated_language, created_at, updated_at";

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
  /** Intégration à l'origine du post (canal API) — attribue l'événement
      « créé » à l'intégration dans le fil d'activité. */
  integrationId?: string | null;
  /** false = retour privé : collecté par l'équipe mais jamais publié sur le
      board. Par défaut public (choix explicite du visiteur au composeur). */
  isPublic?: boolean;
  /**
   * false = ne PAS soumettre ce post à la passe de revue de Numo (MIN-106) —
   * pour un client qui fait tourner son propre classifier. Défaut true.
   *
   * La revue est UNE passe (MIN-87) qui modère, catégorise et dédoublonne en un
   * seul appel : il n'y a pas de demi-mesure, `false` les coupe toutes les
   * trois. Le post est donc publié tel quel, et marqué comme déjà traité pour
   * que le cron ne vienne pas le reprendre plus tard.
   */
  analyze?: boolean;
}): Promise<CreateFeedbackPostResult> {
  const service = getServiceClient();
  const title = input.title.trim().slice(0, FEEDBACK_TITLE_MAX);
  const body = (input.body ?? "").trim().slice(0, FEEDBACK_BODY_MAX);
  if (!title) return { ok: false, status: 400, errorKey: "titleRequired" };

  // Imputation au owner du projet, DEMANDÉE (MIN-131) : `authorId` est un
  // `feedback_users.id` (un visiteur du board), pas un compte auth — il n'y a
  // donc aucun déclencheur nommable à facturer, et c'est bien le budget du owner
  // qui autorise l'appel (`ownerHasUsageBudget`).
  const embedding = await embedText(body ? `${title}\n\n${body}` : title, {
    timeoutMs: EMBED_TIMEOUT_MS,
    record: { billTo: { projectOwner: input.projectId }, projectId: input.projectId },
  });

  // Revue avant publication (MIN-54) : les soumissions board/API attendent la
  // passe IA (modération + catégorisation) avant d'apparaître sur le board ; la
  // saisie interne (équipe de confiance) est publiée d'emblée. Si la revue est
  // désarmée — kill-switch d'instance ou réglage du projet — retenir les posts
  // n'aurait aucun sens : personne ne viendrait les publier.
  //
  // `analyze: false` (MIN-106) rejoint ce cas par une troisième porte : le
  // client a son propre classifier et refuse le nôtre POUR CE POST.
  const analyze = input.analyze !== false;
  const reviewEnabled = analyze && (await isFeedbackReviewEnabled(input.projectId));
  const heldForReview = input.source !== "internal" && reviewEnabled;

  // Un post qu'on ne reverra pas doit être marqué COMME DÉJÀ TRAITÉ : le claim
  // du cron sélectionne sur `analyzed_at is null or classified_at is null`, et
  // un post laissé sans marqueur y remonterait à la première passe horaire —
  // c'est-à-dire exactement l'analyse à laquelle le client a dit non.
  const now = new Date().toISOString();
  const reviewMarkers = analyze ? {} : { analyzed_at: now, classified_at: now };

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
      review_state: heldForReview ? "pending" : "published",
      source: input.source,
      embedding: embedding ? toVectorLiteral(embedding) : null,
      ...reviewMarkers,
    })
    .select(FEEDBACK_POST_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[feedback-posts] insert failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const post = data as FeedbackPostRow;

  // Analytics (MIN-78). Le board public est visité par des ANONYMES : côté
  // client, la plupart n'auront jamais tranché le bandeau cookies, et un retour
  // envoyé depuis une intégration n'a pas de navigateur du tout. C'est donc ici
  // qu'on compte. Ni le titre ni le corps ne partent — seulement leur volume.
  captureServerEvent({
    distinctId: input.authorId ?? input.createdByMember ?? "feedback:anonymous",
    event: "public_feedback_created",
    properties: {
      source: input.source,
      is_public: input.isPublic ?? true,
      has_body: body.length > 0,
      title_length_bucket: lengthBucket(title),
      body_length_bucket: lengthBucket(body),
      via_integration: !!input.integrationId,
      // MIN-106 : sans ça on ne saurait jamais si l'option `analyze` sert.
      analyze,
      project_id: input.projectId,
    },
    groups: { project: input.projectId },
  });

  // Activité : l'événement « créé » ancre le fil, attribué au bon canal.
  await emitFeedbackCreated(service, {
    postId: post.id,
    source: input.source,
    createdByMember: input.createdByMember ?? null,
    integrationId: input.integrationId ?? null,
  });

  // Revue immédiate (MIN-87), après la réponse : un retour retenu pour revue
  // apparaît sur le board en quelques secondes au lieu d'attendre le cron
  // horaire. Le cron reste le filet de sécurité (LLM en panne, budget à sec) ; le
  // claim empêche les deux de traiter le même post. Best-effort de bout en bout :
  // hors contexte de requête, `after` lève — la revue attendra simplement le cron.
  if (analyze) {
    try {
      after(async () => {
        try {
          await reviewFeedbackPost(post.id, post.project_id);
        } catch (e) {
          console.error("[feedback-posts] inline review failed:", (e as Error).message);
        }
      });
    } catch {
      // Pas de contexte de requête (script, worker) : le cron s'en chargera.
    }
  }

  // Inbox (MIN-82) : un feedback qui ARRIVE (board public / API) prévient toute
  // l'équipe — sans ça, on ne découvre les retours qu'en ouvrant le board. La
  // saisie interne ne notifie pas (l'équipe est déjà au courant : elle l'écrit).
  if (input.source !== "internal") {
    try {
      const members = await projectMemberIds(service, input.projectId);
      await insertNotifications(
        service,
        [...members].map((uid) => ({
          user_id: uid,
          project_id: input.projectId,
          type: "feedback_new" as const,
          issue_id: null,
          feedback_post_id: post.id,
          actor_id: null,
        }))
      );
    } catch (e) {
      console.error("[feedback-posts] notify failed:", (e as Error).message);
    }
  }

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
    .is("deleted_at", null)
    .eq("id", postId)
    .maybeSingle();
  return (data as FeedbackPostRow | null) ?? null;
}

export type UpdateFeedbackFieldsResult =
  | { ok: true; post: FeedbackPostRow }
  | {
      ok: false;
      status: number;
      errorKey:
        | "feedbackNotFound"
        | "titleRequired"
        | "invalidStatus"
        | "invalidRequest"
        | "noFieldsToUpdate"
        | "databaseError";
    };

/**
 * Édition de la couche canonique d'un post (titre, corps, statut manuel,
 * réponse d'équipe — jamais submitted_*), avec journal d'activité. Core partagé
 * par la route PATCH et l'outil Numo `respond_to_feedback`, pour une seule
 * source de vérité sur la validation et l'émission d'événements. Seuls les
 * champs présents dans `input` sont touchés.
 */
export async function updateFeedbackPostFields(params: {
  postId: string;
  actorId: string | null;
  input: Record<string, unknown>;
  /** Journalise l'action comme venant de Numo (acteur "Numo" dans le fil). */
  viaAssistant?: boolean;
  /** Attribue l'action à l'agent MCP (via_mcp + clé) dans le fil. */
  mcpKeyId?: string | null;
}): Promise<UpdateFeedbackFieldsResult> {
  const service = getServiceClient();
  const { data: before } = await service
    .from("feedback_posts")
    .select(FEEDBACK_POST_SELECT)
    .is("deleted_at", null)
    .eq("id", params.postId)
    .maybeSingle();
  if (!before) return { ok: false, status: 404, errorKey: "feedbackNotFound" };

  const input = params.input;
  const updates: Record<string, unknown> = {};
  if ("title" in input) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return { ok: false, status: 400, errorKey: "titleRequired" };
    updates.title = title.slice(0, FEEDBACK_TITLE_MAX);
  }
  if ("body" in input) {
    if (typeof input.body !== "string") {
      return { ok: false, status: 400, errorKey: "invalidRequest" };
    }
    updates.body = input.body.slice(0, FEEDBACK_BODY_MAX);
  }
  if ("status" in input) {
    if (!isFeedbackPostStatus(input.status)) {
      return { ok: false, status: 400, errorKey: "invalidStatus" };
    }
    updates.status = input.status;
  }
  if ("team_response" in input) {
    const response =
      typeof input.team_response === "string" ? input.team_response.trim() : "";
    updates.team_response = response || null;
    updates.team_response_at = response ? new Date().toISOString() : null;
  }
  // Visibilité (MIN-37) : l'équipe peut basculer un post public/privé depuis le
  // dashboard. false = retiré du board (list, détail non-auteur, suggestions).
  if ("is_public" in input) {
    if (typeof input.is_public !== "boolean") {
      return { ok: false, status: 400, errorKey: "invalidRequest" };
    }
    updates.is_public = input.is_public;
  }
  // État de publication (MIN-54) : l'équipe peut outrepasser la revue IA —
  // publier un post en attente/rejeté, ou rejeter un post publié.
  if ("review_state" in input) {
    if (!isFeedbackReviewState(input.review_state)) {
      return { ok: false, status: 400, errorKey: "invalidRequest" };
    }
    updates.review_state = input.review_state;
    // Un override manuel repositionne le post comme classé (il ne doit pas
    // repasser dans la file de revue IA après décision humaine).
    if (before.classified_at === null) {
      updates.classified_at = new Date().toISOString();
    }
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  const { data, error } = await service
    .from("feedback_posts")
    .update(updates)
    .is("deleted_at", null)
    .eq("id", params.postId)
    .select(FEEDBACK_POST_SELECT)
    .maybeSingle();
  if (error || !data) {
    console.error("[feedback-posts] update failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  await emitFeedbackFieldChanges(service, {
    postId: params.postId,
    actorId: params.actorId,
    before: before as unknown as Record<string, unknown>,
    updates,
    viaAssistant: params.viaAssistant,
    mcpKeyId: params.mcpKeyId,
  });

  return { ok: true, post: data as FeedbackPostRow };
}
