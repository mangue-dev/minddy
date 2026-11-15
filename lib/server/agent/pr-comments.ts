import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import { PR_BODY_COMMENT_ID, type ReviewReactionContent } from "@/lib/pr-review-reactions";
import { forgeErrorResponse, MAX_COMMENT_BODY_LENGTH, requireActor } from "./pr-access";
import { recordPrActionEvent } from "./pr-action-events";
import { withForgeAttachmentPublication } from "./pr-attachments";
import { recordPrCommentEditQuiet } from "./pr-comment-edits";
import { broadcastPrChanged } from "./pr-live";
import { startNumoPrReview } from "./pr-numo-review";
import { actorCall, type PrScope } from "./pr-scope";
import { pullRequestIssueIds } from "./pull-requests";

/**
 * The conversation thread: messages, PR activity (MIN-159), and reactions on
 * the PR body and messages (MIN-147), served together because they render as
 * one thread ordered by date.
 *
 * Activity and reactions are best-effort: an unreadable timeline (missing
 * permission, endpoint unavailable) leaves the messages alone, never an error.
 *
 * Messages and activity are read on the installation token; reactions depend
 * on who is looking, hence `viewerIsActor`. Without an actor the counts stay
 * right but no chip lights up, rather than showing the bot's reaction as
 * everyone's.
 */
export async function prCommentsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    const actorRead = scope.actor();
    const commentsRead = scope.forge.listPullRequestComments(scope.call);
    const readReactions = (commentIds: number[]) => actorRead.then((actor) => {
      const viewerIsActor = actor.kind === "actor";
      return scope.forge.listConversationReactions({
        ...(viewerIsActor ? actorCall(actor, scope) : scope.call),
        commentIds,
        viewerIsActor,
      });
    }).catch(() => {
      console.error("[pr-actions] conversation_reactions_unreadable");
      return [];
    });
    // The PR body belongs to the conversation and accepts reactions like a
    // thread message. A forge that needs the comment ids waits for them; the
    // other starts at once (MIN-889).
    const reactionsRead = scope.forge.reactionsNeedCommentIds
      ? commentsRead.then((comments) => readReactions([PR_BODY_COMMENT_ID, ...comments.map((c) => c.id)]))
      : readReactions([PR_BODY_COMMENT_ID]);
    const [comments, timeline, , reactions] = await Promise.all([
      commentsRead,
      scope.forge.listTimeline(scope.call).catch(() => {
        console.error("[pr-actions] timeline_unreadable");
        return [];
      }),
      actorRead,
      reactionsRead,
    ]);
    return NextResponse.json({ comments, timeline, reactions });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Adds or removes a reaction on a thread message, or on the PR body
 * (`comment_id: 0`). Needs `read`, like the review side: removing one rereads
 * the subject's reactions with the same token.
 */
export async function setPrCommentReactionResponse(
  scope: PrScope,
  payload: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<NextResponse> {
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    await scope.forge.setConversationReaction({
      ...actorCall(actor.actor, scope),
      ...payload,
      login: actor.actor.login,
    });
    // Live update (MIN-161). GitHub sends no webhook for reactions, so this
    // broadcast is the only way a teammate on the same PR sees it.
    broadcastPrChanged(scope.pr.id, ["conversation"]);
    return NextResponse.json({ ok: true, on: payload.on });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

export async function createPrCommentResponse(
  scope: PrScope,
  body: string,
  userId: string,
  supabase: SupabaseClient,
): Promise<NextResponse> {
  // A human gesture: sent from the person's git account, not minddy's bot.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    const comment = await withForgeAttachmentPublication(scope.pr.id, body,
      () => scope.forge.createPullRequestComment({
      ...actorCall(actor.actor, scope),
      body: body.slice(0, MAX_COMMENT_BODY_LENGTH),
    }));
    // Live update for everyone on this PR. The webhook echo would say the same
    // a few seconds later, too late for a conversation, and never without a
    // deployed webhook (dev).
    broadcastPrChanged(scope.pr.id, ["conversation"]);
    // Record “commented on the PR” on the linked ticket only after publication;
    // a message rejected by the forge does not exist for anyone.
    for (const issueId of await pullRequestIssueIds(scope.pr.id)) {
      await recordPrActionEvent(
        issueId,
        userId,
        "pr_commented",
        scope.pr.number,
        scope.target.provider,
      );
    }
    // `@numo` in the message: Numo starts after publication, outside the
    // response path, as `lib/server/add-comment.ts` does for a ticket comment.
    // The message must exist before Numo answers, and the author does not
    // wait for the review to see their comment.
    const review = mentionsNumo(body)
      ? await startNumoPrReview({
          scope,
          userId,
          supabase,
          sourceEventId: String(comment.id),
          question: { author: actor.actor.login, body },
        })
      : null;
    // The started review goes back in the response: it is the only moment the
    // screen can learn of it. Otherwise it would only show at the next
    // refresh, after a minute of silence following the `@numo`.
    return NextResponse.json({ comment, ...(review ? { review } : {}) });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Edits an existing thread comment (MIN-548). Human gesture, under the
 * person's git account like the create. The CURRENT body is snapshotted into
 * `pr_comment_edits` after a successful forge write using its edit timestamp.
 * A failed snapshot leaves a gap in history without failing the edit.
 * The thread broadcast goes out like the create path, then the updated
 * comment — whose `updated_at` now carries the "(edited)" marker — is
 * returned.
 */
export async function updatePrCommentResponse(
  scope: PrScope,
  payload: { commentId: number; body: string },
): Promise<NextResponse> {
  // Same level as the create: composing a comment only needs `read`, and
  // editing one is the same gesture.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    // Snapshot FIRST, from the forge's own state: if the read fails, we still
    // edit — the history simply starts with this edit.
    let previous: string | null = null;
    try {
      const comments = await scope.forge.listPullRequestComments(scope.call);
      previous = comments.find((c) => c.id === payload.commentId)?.body ?? null;
    } catch {
      console.error("[pr-actions] edit_snapshot_read_failed");
    }
    const comment = await withForgeAttachmentPublication(scope.pr.id, payload.body,
      () => scope.forge.updatePullRequestComment({
      ...actorCall(actor.actor, scope),
      commentId: payload.commentId,
      body: payload.body.slice(0, MAX_COMMENT_BODY_LENGTH),
    }));
    if (previous != null && previous !== comment.body) {
      await recordPrCommentEditQuiet({
        provider: scope.target.provider,
        repoFullName: scope.target.repoFullName,
        prNumber: scope.pr.number,
        commentId: payload.commentId,
        body: previous,
        editedBy: actor.actor.login,
        occurredAt: comment.updated_at,
      });
    }
    // Live update (MIN-161): the webhook echo would only repeat it later, and
    // GitLab sends no echo for a note edit at all.
    broadcastPrChanged(scope.pr.id, ["conversation"]);
    return NextResponse.json({ comment });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}
