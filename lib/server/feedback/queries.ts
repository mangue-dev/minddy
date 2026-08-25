import "server-only";

import { cache } from "react";
import { getServiceClient } from "@/lib/supabase-service";
import {
  isHiddenFeedbackStatus,
  sortFeedbackResolvedLast,
  type FeedbackPostStatus,
  type PublicComment,
  type PublicPost,
} from "@/lib/feedback/types";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";
import {
  emptyCommentSummary,
  listPublicComments,
  publicCommentSummaries,
  type PublicCommentSummary,
} from "@/lib/server/feedback/comments";

/**
 * Public board readings (MIN-37). Everything goes through customer service (RLS
 * deny-all); anonymization is done HERE: only the pseudonyms come out,
 * never the email or the name. The board only shows canonical posts —
 * a merged post only exists publicly through its redirection.
 */

const PUBLIC_LIST_LIMIT = 200;

export type PublicSort = "top" | "recent";

interface PostWithAuthor extends FeedbackPostRow {
  feedback_users: { pseudonym: string } | null;
}

// The !author_id hint is required because PostgREST also sees the many-to-many
// posts-to-users path through feedback_votes; an unqualified embed is ambiguous.
const PUBLIC_POST_SELECT = `${FEEDBACK_POST_SELECT}, feedback_users!author_id (pseudonym)`;

function toPublicPost(
  row: PostWithAuthor,
  viewerId: string | null,
  votedPostIds: Set<string>,
  comments: PublicCommentSummary = emptyCommentSummary()
): PublicPost {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    isPublic: row.is_public,
    reviewState: row.review_state,
    voteCount: row.vote_count,
    createdAt: row.created_at,
    authorPseudonym: row.feedback_users?.pseudonym ?? null,
    isMine: viewerId !== null && row.author_id === viewerId,
    votedByMe: votedPostIds.has(row.id),
    commentCount: comments.count,
    teamRepliedAt: comments.teamRepliedAt,
  };
}

async function fetchViewerVotes(
  viewerId: string | null,
  postIds: string[]
): Promise<Set<string>> {
  if (!viewerId || postIds.length === 0) return new Set();
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_votes")
    .select("post_id")
    .eq("user_id", viewerId)
    .in("post_id", postIds);
  return new Set((data ?? []).map((v) => v.post_id as string));
}

export async function listPublicPosts(params: {
  projectId: string;
  viewerId: string | null;
  sort: PublicSort;
  /**
 * The statuses to keep (`publicFilterStatuses`) — `null`/absent = all. A
 * LIST and not a status: the board's default filter in group three
 * (open, planned, in progress), and doing it on the SQL side avoids loading the archive
 * and then throwing it away.
 */
  statuses?: readonly FeedbackPostStatus[] | null;
}): Promise<PublicPost[]> {
  const service = getServiceClient();
  let query = service
    .from("feedback_posts")
    .select(PUBLIC_POST_SELECT)
    .is("deleted_at", null)
    .eq("project_id", params.projectId)
    .is("merged_into_id", null)
    // Private feedback goes back to the team but is never listed here.
    .eq("is_public", true)
    // Review before publication (MIN-54): a pending post does not appear.
    .eq("review_state", "published")
    // Spam never has a public page — that's what the status decides.
    .neq("status", "spam")
    .limit(PUBLIC_LIST_LIMIT);
  if (params.statuses) {
    if (params.statuses.length === 0) return [];
    query = query.in("status", [...params.statuses]);
  }
  query =
    params.sort === "top"
      ? query.order("vote_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) console.error("[feedback-queries] list failed:", error.message);
  const rows = (data ?? []) as unknown as PostWithAuthor[];
  const ids = rows.map((r) => r.id);
  const [voted, comments] = await Promise.all([
    fetchViewerVotes(params.viewerId, ids),
    publicCommentSummaries(ids),
  ]);
  const posts = rows.map((r) =>
    toPublicPost(r, params.viewerId, voted, comments.get(r.id))
  );
  // Completed (delivered / refused) ranked at the bottom, the chosen order (votes/date)
  // kept within each group.
  return sortFeedbackResolvedLast(posts, (p) => p.status);
}

/**
 * Does the board only have one public return?
 *
 * ONLY to be called when the list returns zero lines, and for one reason only:
 * to distinguish the two empty ones. A new board must read “be first”; a
 * board on which everything is delivered or declined must read "nothing matches this
 * filter" - otherwise it is announced that it is empty in front of twenty returns processed,
 * and the visitor has no reason to go and find "all".
 */
export async function hasAnyPublicPost(projectId: string): Promise<boolean> {
  const service = getServiceClient();
  const { count } = await service
    .from("feedback_posts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("project_id", projectId)
    .is("merged_into_id", null)
    .eq("is_public", true)
    .eq("review_state", "published")
    .neq("status", "spam");
  return (count ?? 0) > 0;
}

export interface PublicPostDetail {
  post: PublicPost;
  /** Informed if THIS post is a tombstone: redirect to the canonical. */
  mergedIntoId: string | null;
  /** Titles of posts merged into this one (“merged since”). */
  mergedFromTitles: string[];
  /** The public feedback thread (MIN-196), anonymized, from oldest to most recent. Team response is one of them — it's no longer around. */
  comments: PublicComment[];
}

export async function getPublicPostDetail(params: {
  projectId: string;
  postId: string;
  viewerId: string | null;
}): Promise<PublicPostDetail | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(PUBLIC_POST_SELECT)
    .is("deleted_at", null)
    .eq("id", params.postId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as PostWithAuthor;
  // Publicly visible only if public, published AND not spam
  // (MIN-54/MIN-37). A private post, awaiting review or dismissed cannot be opened
  // only by its author; others → 404. Everything remains visible on the team side via
  // the project feedback tab.
  const publiclyVisible =
    row.is_public && row.review_state === "published" && !isHiddenFeedbackStatus(row.status);
  if (!publiclyVisible && row.author_id !== params.viewerId) return null;
  if (row.merged_into_id !== null) {
    // Tombstone: canonical carries all, caller redirects.
    return {
      post: toPublicPost(row, params.viewerId, new Set<string>()),
      mergedIntoId: row.merged_into_id,
      mergedFromTitles: [],
      comments: [],
    };
  }

  const [voted, mergedFromRes, comments] = await Promise.all([
    fetchViewerVotes(params.viewerId, [row.id]),
    service
      .from("feedback_posts")
      .select("title")
      .is("deleted_at", null)
      .eq("merged_into_id", row.id)
      .eq("is_public", true)
      .eq("review_state", "published")
      .neq("status", "spam")
      .order("created_at", { ascending: true }),
    listPublicComments({ postId: row.id, viewerId: params.viewerId }),
  ]);

  return {
    post: toPublicPost(row, params.viewerId, voted, {
      count: comments.length,
      teamRepliedAt:
        comments.filter((c) => c.isTeam).at(-1)?.createdAt ?? null,
    }),
    mergedIntoId: null,
    mergedFromTitles: (mergedFromRes.data ?? []).map((p) => p.title as string),
    comments,
  };
}

/**
 * Title and body of a post, for the metadata of its page (MIN-95).
 *
 * Deliberately stricter than `getPublicPostDetail`: this one lets its
 * AUTHOR open a private post or one awaiting review, which is just for the
 * page — but a `<title>` or `og:description` leaves in the link preview of
 * which receives the URL, not just in the author tab. Only publicly visible posts
 * therefore name their page; the others fall on the
 * generic title of the board.
 *
 * `cache()` on primitive arguments: two calls in the same request
 * (none today, but the page will perhaps make one) cost than a
 * reading.
 */
export const getPublicPostMeta = cache(
  async (
    projectId: string,
    postId: string,
  ): Promise<{ title: string; body: string } | null> => {
    const service = getServiceClient();
    const { data } = await service
      .from("feedback_posts")
      .select("title, body, is_public, status, review_state, merged_into_id")
      .is("deleted_at", null)
      .eq("id", postId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) return null;
    if (!data.is_public || data.review_state !== "published") return null;
    if (isHiddenFeedbackStatus(data.status as FeedbackPostStatus)) return null;
    // A merged duplicate redirects in 308 to its canonical: this is what
    // last one which names the page.
    if (data.merged_into_id !== null) return null;
    return { title: data.title as string, body: (data.body as string) ?? "" };
  },
);

export interface MyFeedbackEntry {
  /** Post to display (the canonical if mine was merged). */
  post: PublicPost;
  relation: "authored" | "voted";
  /** Title originally submitted when my post was merged into another. */
  mergedFromTitle: string | null;
}

/**
 * “My feedback”: my posts (including merged ones — followed up to the canonical
 *) and my votes, with their progress.
 *
 * A private feedback only enters if I WROTE it. Private means "read by
 * the team alone": seeing it in your list because you voted on it before
 * the team removed it from the board, or because yours was merged there, it's
 * reading someone else's return to a place where the board promised that you
 * wouldn't would not read.
 */
export async function listMyFeedback(params: {
  projectId: string;
  viewerId: string;
}): Promise<MyFeedbackEntry[]> {
  const service = getServiceClient();

  const [authoredRes, votedRes] = await Promise.all([
    service
      .from("feedback_posts")
      .select(PUBLIC_POST_SELECT)
      .is("deleted_at", null)
      .eq("project_id", params.projectId)
      .eq("author_id", params.viewerId)
      .order("created_at", { ascending: false }),
    service
      .from("feedback_votes")
      .select(`post_id, feedback_posts!inner (${PUBLIC_POST_SELECT})`)
      .eq("user_id", params.viewerId)
      .eq("feedback_posts.project_id", params.projectId),
  ]);

  const authored = (authoredRes.data ?? []) as unknown as PostWithAuthor[];
  const votedRows = (votedRes.data ?? []) as unknown as {
    post_id: string;
    feedback_posts: PostWithAuthor;
  }[];

  // My merged posts: follow the pointer (depth ≤ 1 by flattening).
  const mergedTargets = authored
    .map((p) => p.merged_into_id)
    .filter((id): id is string => id !== null);
  const canonicalById = new Map<string, PostWithAuthor>();
  if (mergedTargets.length > 0) {
    const { data } = await service
      .from("feedback_posts")
      .select(PUBLIC_POST_SELECT)
      .is("deleted_at", null)
      .in("id", mergedTargets);
    for (const row of (data ?? []) as unknown as PostWithAuthor[]) {
      canonicalById.set(row.id, row);
    }
  }

  /** Readable here only if public, or written by me. */
  const readable = (row: PostWithAuthor) =>
    row.is_public || row.author_id === params.viewerId;

  const entries: { row: PostWithAuthor; relation: "authored" | "voted"; mergedFromTitle: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of authored) {
    // My return merged into the PRIVATE return of another: we do not follow the
    // pointer, we stay on mine. Follow would show its title and its
    // advancement — precisely what “private” removes from my view.
    const target = row.merged_into_id ? canonicalById.get(row.merged_into_id) : null;
    const canonical = target && readable(target) ? target : null;
    const display = canonical ?? row;
    if (seen.has(display.id)) continue;
    seen.add(display.id);
    entries.push({
      row: display,
      relation: "authored",
      mergedFromTitle: canonical ? row.title : null,
    });
  }
  for (const { feedback_posts: row } of votedRows) {
    // The votes already follow the merge (moved to the canonical); A
    // voted tombstone should not exist, we ignore it for safety.
    if (!row || row.merged_into_id !== null || seen.has(row.id)) continue;
    // If the team made a voted post private, it leaves this list just as it
    // leaves the public board.
    if (!readable(row)) continue;
    seen.add(row.id);
    entries.push({ row, relation: "voted", mergedFromTitle: null });
  }

  const ids = entries.map((e) => e.row.id);
  const [voted, comments] = await Promise.all([
    fetchViewerVotes(params.viewerId, ids),
    publicCommentSummaries(ids),
  ]);
  return entries.map((e) => ({
    post: toPublicPost(e.row, params.viewerId, voted, comments.get(e.row.id)),
    relation: e.relation,
    mergedFromTitle: e.mergedFromTitle,
  }));
}
