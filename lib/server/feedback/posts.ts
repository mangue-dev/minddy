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
 * Creation of feedback posts (MIN-37) — shared core of the three channels
 * (public board, server-to-server API, internal input). Double layer:
 * title/body = canonical editable team; submitted_* = sacred raw, written here
 * only once. The embedding is calculated in best effort BEFORE the insert
 * (short timeout): any failure inserts embedding=null and the time pass
 * catches up — the response never depends on the AI.
 */

// Re-exported: historical callers (app/api/v1/feedback) take them
// here, but they are now defined pure in lib/feedback/types.ts.
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
  /** Consecutive review pass failures — 3 = abort (MIN-87). */
  analysis_failures: number;
  /** Language of the return taken as a whole, as the review read it. */
  source_language: string | null;
  /** Translation into the team's language — NEXT to the text, never in its place: the public board always shows the feedback as it was written. */
  translated_title: string | null;
  translated_body: string | null;
  translated_language: string | null;
  created_at: string;
  updated_at: string;
}

/** Colonnes rendues aux appelants — jamais l'embedding (payload inutile). */
export const FEEDBACK_POST_SELECT =
  "id, project_id, author_id, created_by_member, title, body, submitted_title, submitted_body, status, is_public, review_state, sensitivity, moderation_reason, classified_at, vote_count, issue_id, merged_into_id, suggested_merge_into_id, suggested_confidence, source, analyzed_at, analysis_failures, source_language, translated_title, translated_body, translated_language, created_at, updated_at";

export type CreateFeedbackPostResult =
  | { ok: true; post: FeedbackPostRow }
  | { ok: false; status: number; errorKey: "titleRequired" | "databaseError" };

export async function createFeedbackPost(input: {
  projectId: string;
  title: string;
  body?: string | null;
  source: FeedbackPostSource;
  /** Author identity (feedback_users.id). Null only for posts
 created by the team itself without an attached author. */
  authorId: string | null;
  /** Member who entered the feedback (internal channel only). */
  createdByMember?: string | null;
  /** Embed at post origin (API channel) — assigns the
 “created” event to the embed in the activity feed. */
  integrationId?: string | null;
  /** false = private feedback: collected by the team but never published on the
 board. By default public (explicit choice of the visitor to the composer). */
  isPublic?: boolean;
  /**
 * false = do NOT submit this post to Numo review pass (MIN-106) —
 * for a client running their own classifier. Default true.
 *
 * The review is ONE pass (MIN-87) that moderates, categorizes and deduplicates in a single
 * call: there are no half measures, `false` cuts them every
 * three. The post is therefore published as is, and marked as already processed so that
 * so that the cron does not come and take it again later.
 */
  analyze?: boolean;
}): Promise<CreateFeedbackPostResult> {
  const service = getServiceClient();
  const title = input.title.trim().slice(0, FEEDBACK_TITLE_MAX);
  const body = (input.body ?? "").trim().slice(0, FEEDBACK_BODY_MAX);
  if (!title) return { ok: false, status: 400, errorKey: "titleRequired" };

  // Imputation to the project owner, REQUESTED (MIN-131): `authorId` is a
  // `feedback_users.id` (un visiteur du board), pas un compte auth — il n'y a
  // therefore no nameable trigger to charge, and it is the owner's budget
  // qui autorise l'appel (`ownerHasUsageBudget`).
  const embedding = await embedText(body ? `${title}\n\n${body}` : title, {
    timeoutMs: EMBED_TIMEOUT_MS,
    record: { billTo: { projectOwner: input.projectId }, projectId: input.projectId },
  });

  // Review before publication (MIN-54): board/API submissions await
  // pass IA (moderation + categorization) before appearing on the board; there
  // internal entry (trusted team) is published immediately. If the magazine is
  // disarmed — instance kill-switch or project setting — retain posts
  // would make no sense: no one would come and publish them.
  //
  // `analyze: false` (MIN-106) joins this case by a third door: the
  // client has his own classifier and refuses ours FOR THIS POST.
  const analyze = input.analyze !== false;
  const reviewEnabled = analyze && (await isFeedbackReviewEnabled(input.projectId));
  const heldForReview = input.source !== "internal" && reviewEnabled;

  // A post that will not be seen again must be marked AS ALREADY PROCESSED: the claim
  // from the cron selects `analyzed_at is null or classified_at is null`, and
  // a post left without a marker would go back to the first hourly pass —
  // i.e. exactly the analysis the client said no to.
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

  // Analytics (MIN-78). The public board is visited by ANONYMS: side
  // customer, most will never have cut the cookie strip, and a return
  // sent from an integration has no browser at all. So it's here
  // that we count. Neither the title nor the body goes away — only their volume.
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
      // MIN-106: without that we would never know if the `analyze` option is useful.
      analyze,
      project_id: input.projectId,
    },
    groups: { project: input.projectId },
  });

  // Activity: the “created” event anchors the thread, assigned to the correct channel.
  await emitFeedbackCreated(service, {
    postId: post.id,
    source: input.source,
    createdByMember: input.createdByMember ?? null,
    integrationId: input.integrationId ?? null,
  });

  // Immediate review (MIN-87), after the response: a return held for review
  // appears on the board in a few seconds instead of waiting for the cron
  // hourly. The cron remains the safety net (LLM down, budget dry); THE
  // claim prevents both from processing the same post. Best-effort end-to-end:
  // out of query context, `after` raises — the journal will simply wait for the cron.
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
      // No request context (script, worker): the cron will take care of it.
    }
  }

  // Inbox (MIN-82): feedback that ARRIVES (public board / API) prevents any
  // the team — without that, you only discover the feedback by opening the board. There
  // internal entry does not notify (the team is already aware: it writes it).
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

  // Submit = vote: the author obviously supports his own need.
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
 * Editing the canonical layer of a post (title, body, manual status,
 * team response — never submitted_*), with activity log. Shared core
 * by the PATCH route and the Numo tool `respond_to_feedback`, for a single
 * source of truth on validation and emitting events. Only the
 * fields present in `input` are affected.
 */
export async function updateFeedbackPostFields(params: {
  postId: string;
  actorId: string | null;
  input: Record<string, unknown>;
  /** Logs the action as coming from Numo ("Numo" actor in the thread). */
  viaAssistant?: boolean;
  /** Assigns the action to the MCP agent (via_mcp + key) in the thread. */
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
  // The team response is no longer a return field (MIN-196): it is a
  // public comment to his thread, written by addCommentToFeedbackPost.
  // Visibility (MIN-37): the team can switch a public/private post from the
  // dashboard. false = removed from the board (list, non-author details, suggestions).
  if ("is_public" in input) {
    if (typeof input.is_public !== "boolean") {
      return { ok: false, status: 400, errorKey: "invalidRequest" };
    }
    updates.is_public = input.is_public;
  }
  // Publication status (MIN-54): the team can override the IA review —
  // publish a pending/rejected post, or reject a published post.
  if ("review_state" in input) {
    if (!isFeedbackReviewState(input.review_state)) {
      return { ok: false, status: 400, errorKey: "invalidRequest" };
    }
    updates.review_state = input.review_state;
    // A manual override repositions the post as classified (it should not
    // return to the AI ​​review queue after human decision).
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
