import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  FEEDBACK_COMMENT_BODY_MAX,
  isHiddenFeedbackStatus,
  type FeedbackPostStatus,
  type PublicComment,
} from "@/lib/feedback/types";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";

/**
 * The PUBLIC feedback thread (MIN-196) — the counterpart board of
 * `lib/server/feedback/queries.ts`, from which it follows the rule: everything goes through
 * customer service (feedback comments do not match any policy), and
 * anonymization is done HERE, at the source. What comes out of this module never bears
 * never has an email or name, only a pseudonym in avatar seed.
 *
 * A single reading rule, valid everywhere: a public comment WITHOUT
 * `feedback_user_id` is the voice of the team. This is the case for responses written
 * from the team view (`author_id` entered, but never published) as well as old
 * taken over by the migration (neither one nor the other).
 */

/** Depth ≤ 1, like ticket threads: `parent_id` always carries the
 ROOT of the thread, never the response we were aiming for. */
const PUBLIC_THREAD_LIMIT = 200;

interface PublicCommentRow {
  id: string;
  body: string;
  created_at: string;
  parent_id: string | null;
  feedback_user_id: string | null;
  feedback_users: { pseudonym: string } | null;
}

const PUBLIC_COMMENT_SELECT =
  "id, body, created_at, parent_id, feedback_user_id, feedback_users!feedback_user_id (pseudonym)";

function toPublicComment(row: PublicCommentRow, viewerId: string | null): PublicComment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorSeed: row.feedback_users?.pseudonym ?? null,
    isTeam: row.feedback_user_id === null,
    isMine: viewerId !== null && row.feedback_user_id === viewerId,
    parentId: row.parent_id,
  };
}

/** The public thread of a return, from oldest to newest. */
export async function listPublicComments(params: {
  postId: string;
  viewerId: string | null;
}): Promise<PublicComment[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("comments")
    .select(PUBLIC_COMMENT_SELECT)
    .eq("feedback_post_id", params.postId)
    .eq("visibility", "public")
    .order("created_at", { ascending: true })
    .limit(PUBLIC_THREAD_LIMIT);
  if (error) {
    console.error("[feedback-comments] list failed:", error.message);
    return [];
  }
  return ((data ?? []) as unknown as PublicCommentRow[]).map((row) =>
    toPublicComment(row, params.viewerId)
  );
}

export interface PublicCommentSummary {
  count: number;
  /** Final comment from the TEAM — what the board badge says. */
  teamRepliedAt: string | null;
}

/** A NEW object on each call: the summary is accumulated in place further down, and
 a shared constant would end up counting the comments of the entire
 board on the first return that comes. */
export function emptyCommentSummary(): PublicCommentSummary {
  return { count: 0, teamRepliedAt: null };
}

/**
 * Enough to paint a LIST of feedback without opening a single thread: how many
 * comments, and when the team last spoke.
 *
 * One query for the entire page — a board renders up to 200 lines, and a per-line read would render the list more expensive than everything else on the board.
 */
export async function publicCommentSummaries(
  postIds: string[]
): Promise<Map<string, PublicCommentSummary>> {
  const summaries = new Map<string, PublicCommentSummary>();
  if (postIds.length === 0) return summaries;

  const service = getServiceClient();
  const { data, error } = await service
    .from("comments")
    .select("feedback_post_id, feedback_user_id, created_at")
    .in("feedback_post_id", postIds)
    .eq("visibility", "public");
  if (error) {
    console.error("[feedback-comments] summaries failed:", error.message);
    return summaries;
  }

  for (const row of (data ?? []) as {
    feedback_post_id: string;
    feedback_user_id: string | null;
    created_at: string;
  }[]) {
    const current = summaries.get(row.feedback_post_id) ?? emptyCommentSummary();
    current.count += 1;
    if (
      row.feedback_user_id === null &&
      (current.teamRepliedAt === null || row.created_at > current.teamRepliedAt)
    ) {
      current.teamRepliedAt = row.created_at;
    }
    summaries.set(row.feedback_post_id, current);
  }
  return summaries;
}

export type AddPublicCommentResult =
  | { ok: true; comment: PublicComment }
  | { ok: false; error: "empty" | "closed" | "notFound" | "failed" };

/**
 * The ROOT of the targeted thread, or `null` if the parent is not one of the correct return.
 *
 * Replying to a reply stores the message under the same root (depth ≤ 1):
 * the conversation remains a list of threads, not a tree. The parent must be
 * public and belong to THIS feedback — otherwise we would attach a public
 * response to a team note, and the board would read it.
 */
async function resolvePublicThreadRoot(
  service: ReturnType<typeof getServiceClient>,
  postId: string,
  parentId: string
): Promise<string | null> {
  const { data: parent } = await service
    .from("comments")
    .select("id, parent_id, feedback_post_id, visibility")
    .eq("id", parentId)
    .maybeSingle();
  if (
    !parent ||
    parent.feedback_post_id !== postId ||
    parent.visibility !== "public"
  ) {
    return null;
  }
  return (parent.parent_id as string | null) ?? (parent.id as string);
}

/**
 * A visitor adds a comment to the public thread.
 *
 * Three rejections, and they don't say the same thing: `closed` = the board doesn't
 * takes more comments (project setting), `notFound` = this feedback has
 * no public page (private, awaiting review, discarded, or merged into a
 * other) — the same signal as that given by `getPublicPostDetail`, so as not to
 * announce through the band the existence of a return that is not shown.
 */
export async function addPublicComment(params: {
  projectId: string;
  boardAllowsComments: boolean;
  postId: string;
  feedbackUserId: string;
  body: string;
  /** The message being responded to — stored under the root of its thread. */
  parentId?: string | null;
}): Promise<AddPublicCommentResult> {
  const text = params.body.trim().slice(0, FEEDBACK_COMMENT_BODY_MAX);
  if (!text) return { ok: false, error: "empty" };
  if (!params.boardAllowsComments) return { ok: false, error: "closed" };

  const service = getServiceClient();
  const { data: post } = await service
    .from("feedback_posts")
    .select("id, project_id, is_public, review_state, status, merged_into_id")
    .is("deleted_at", null)
    .eq("id", params.postId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (
    !post ||
    !post.is_public ||
    post.review_state !== "published" ||
    isHiddenFeedbackStatus(post.status as FeedbackPostStatus) ||
    post.merged_into_id !== null
  ) {
    return { ok: false, error: "notFound" };
  }

  let rootId: string | null = null;
  if (params.parentId) {
    rootId = await resolvePublicThreadRoot(service, params.postId, params.parentId);
    if (!rootId) return { ok: false, error: "notFound" };
  }

  const { data, error } = await service
    .from("comments")
    .insert({
      feedback_post_id: params.postId,
      author_id: null,
      feedback_user_id: params.feedbackUserId,
      body: text,
      visibility: "public",
      parent_id: rootId,
    })
    .select(PUBLIC_COMMENT_SELECT)
    .single();
  if (error || !data) {
    console.error("[feedback-comments] create failed:", error?.message);
    return { ok: false, error: "failed" };
  }

  // The team must LEARN that it was answered on the board: otherwise, a thread
  // public only lives if someone thinks to go and reread it. The actor remains useless
  // — the commenter is a visitor, not a member, and their identity is not
  // not go back to the notifications thread.
  const memberIds = await projectMemberIds(service, params.projectId);
  const rows: NotificationRow[] = [...memberIds].map((uid) => ({
    user_id: uid,
    project_id: params.projectId,
    type: "comment" as const,
    issue_id: null,
    feedback_post_id: params.postId,
    comment_id: data.id as string,
    actor_id: null,
  }));
  await insertNotifications(service, rows);

  return {
    ok: true,
    comment: toPublicComment(
      data as unknown as PublicCommentRow,
      params.feedbackUserId
    ),
  };
}

/**
 * A visitor removes THEIR comment. The equality on `feedback_user_id` is the
 * guard: it excludes at the same time the comments of others and those of
 * the team (which do not carry any). Team moderation goes through the
 * internal route — same table, different door.
 *
 * A message to which WE RESPONDED can no longer be deleted, and it is structural:
 * `comments.parent_id` cascade, so deleting a root would take away all of its
 * answers — that of the team included. Without this guard, anyone
 * could erase the team's public answer by deleting their own
 * question. We take back what we said as long as no one speaks afterwards.
 */
export async function deletePublicComment(params: {
  postId: string;
  commentId: string;
  feedbackUserId: string;
}): Promise<boolean> {
  const service = getServiceClient();
  const { count: replyCount } = await service
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", params.commentId);
  if ((replyCount ?? 0) > 0) return false;

  const { error, count } = await service
    .from("comments")
    .delete({ count: "exact" })
    .eq("id", params.commentId)
    .eq("feedback_post_id", params.postId)
    .eq("visibility", "public")
    .eq("feedback_user_id", params.feedbackUserId);
  if (error) {
    console.error("[feedback-comments] delete failed:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}
