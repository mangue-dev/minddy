import { commentStore } from "@/lib/server/comment-store";
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

/**
 * One page of the public thread. Reading is bounded, but nothing past the
 * bound is lost (MIN-714): the page is the MOST RECENT window, so a new
 * comment always shows after it is posted, and older windows are reached
 * through `earlierCursor`.
 */
export const PUBLIC_THREAD_LIMIT = 200;

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

export interface PublicCommentPage {
  /** Oldest to newest; a loaded reply always comes with its thread root. */
  comments: PublicComment[];
  /**
   * The oldest comment of this page when older ones exist: pass it as
   * `before` to read the previous page. Null when the page reaches the start.
   */
  earlierCursor: string | null;
  /** Count and last team reply of the WHOLE thread, not of this page. */
  summary: PublicCommentSummary;
}

interface PublicCommentMeta {
  id: string;
  created_at: string;
  parent_id: string | null;
  feedback_user_id: string | null;
}

function byThreadOrder(a: { created_at: string; id: string }, b: { created_at: string; id: string }): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Ids per body read: keeps each request URL well under proxy limits. */
const BODY_READ_CHUNK = 100;

/**
 * A page of the public thread of a return, oldest to newest within the page.
 *
 * Reading is bounded where it costs (bodies) and complete where it is cheap
 * (metadata). The metadata of the whole thread is read first: it gives the
 * true count and the last team reply, and places the page. The page is the
 * newest `PUBLIC_THREAD_LIMIT` comments before `before` (the newest of all
 * without it), so a comment just posted always shows (MIN-714). Depth ≤ 1
 * means a reply in the page may answer a root posted long before it: that
 * root's body is read too, so a reply never shows detached from what it
 * answers. A later page that reaches such a root returns it again; the reader
 * dedupes by id.
 *
 * `before` comes from the client: it is only ever matched against ids of
 * THIS thread, never interpolated into a query. An unknown id yields an empty
 * page. The CALLER decides whether the viewer may read this post; this
 * function only guarantees that nothing but public comments of `postId` comes
 * out.
 */
export async function listPublicComments(params: {
  postId: string;
  viewerId: string | null;
  before?: string | null;
}): Promise<PublicCommentPage> {
  const empty: PublicCommentPage = {
    comments: [],
    earlierCursor: null,
    summary: emptyCommentSummary(),
  };
  const service = getServiceClient();
  // Newest first, so that a server-side row cap would drop the oldest
  // metadata rather than the comments just posted; the exact count stays true.
  const { data: metaData, error: metaError, count } = await commentStore(service, "comments")
    .select("id, created_at, parent_id, feedback_user_id", { count: "exact" })
    .eq("feedback_post_id", params.postId)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });
  if (metaError) {
    console.error("[feedback-comments] list_failed");
    return empty;
  }
  const meta = ((metaData ?? []) as unknown as PublicCommentMeta[]).sort(byThreadOrder);

  const summary = emptyCommentSummary();
  summary.count = Math.max(count ?? 0, meta.length);
  summary.teamRepliedAt =
    meta.filter((row) => row.feedback_user_id === null).at(-1)?.created_at ?? null;

  const end = params.before ? meta.findIndex((row) => row.id === params.before) : meta.length;
  if (end < 0) return { ...empty, summary };
  const start = Math.max(0, end - PUBLIC_THREAD_LIMIT);
  const page = meta.slice(start, end);

  const wanted = new Set(page.map((row) => row.id));
  for (const row of page) if (row.parent_id) wanted.add(row.parent_id);
  const ids = [...wanted];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BODY_READ_CHUNK) chunks.push(ids.slice(i, i + BODY_READ_CHUNK));
  const results = await Promise.all(
    chunks.map((chunk) =>
      commentStore(service, "comments")
        .select(PUBLIC_COMMENT_SELECT)
        .eq("feedback_post_id", params.postId)
        .eq("visibility", "public")
        .in("id", chunk)
    )
  );
  if (results.some((result) => result.error)) {
    console.error("[feedback-comments] list_failed");
    return { ...empty, summary };
  }
  const rows = results.flatMap((result) => (result.data ?? []) as unknown as PublicCommentRow[]);

  return {
    comments: rows.sort(byThreadOrder).map((row) => toPublicComment(row, params.viewerId)),
    earlierCursor: start > 0 ? page[0].id : null,
    summary,
  };
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
  const { data, error } = await commentStore(service, "comments")
    .select("feedback_post_id, feedback_user_id, created_at")
    .in("feedback_post_id", postIds)
    .eq("visibility", "public");
  if (error) {
    console.error("[feedback-comments] summaries_failed");
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
  const { data: parent } = await commentStore(service, "comments")
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

  const { data, error } = await commentStore(service, "comments")
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
    console.error("[feedback-comments] create_failed");
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
  const { data, error } = await getServiceClient().rpc(
    "delete_public_feedback_comment",
    {
      p_post_id: params.postId,
      p_comment_id: params.commentId,
      p_feedback_user_id: params.feedbackUserId,
    }
  );
  if (error) {
    console.error("[feedback-comments] delete_failed");
    return false;
  }
  return data === true;
}
