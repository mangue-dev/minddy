import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";
import {
  sortFeedbackResolvedLast,
  type FeedbackPostStatus,
  type IssueLinkedFeedback,
} from "@/lib/feedback/types";

/**
 * Team side readings (MIN-37) — unlike the public board, the real
 * identities come out here (name, email, external_id): this is the channel for
 * recontact. Member checks are done by the calling routes.
 */

export interface TeamFeedbackAuthor {
  id: string;
  pseudonym: string;
  email: string | null;
  name: string | null;
  external_id: string | null;
  verified_via: "email" | "sso" | "api";
}

const AUTHOR_SELECT = "id, pseudonym, email, name, external_id, verified_via";

/** Embed N–N categories (MIN-52) — flattened to `category_ids` on the client side. */
const CATEGORY_EMBED = "feedback_post_categories(category_id)";

type WithCategoryEmbed = { feedback_post_categories?: { category_id: string }[] | null };

/** Flattens the embed junction into a list of ids, then removes the raw field from the row. */
function flattenCategories<T extends WithCategoryEmbed>(
  row: T
): Omit<T, "feedback_post_categories"> & { category_ids: string[] } {
  const { feedback_post_categories, ...rest } = row;
  return {
    ...rest,
    category_ids: (feedback_post_categories ?? []).map((c) => c.category_id),
  };
}

export interface TeamFeedbackListItem extends FeedbackPostRow {
  author: TeamFeedbackAuthor | null;
  suggested_title: string | null;
  category_ids: string[];
}

/**
 * The returns of a project, team view — capped at 500, sorted by votes.
 *
 * `statuses` filter IN THE REQUEST, and this is the only correct way to do it
 *: the sort is by votes, so the statuses are “settled” (spam in the lead, which
 * does not collect votes) are precisely those that the ceiling cuts off. Filter
 * afterwards on the window returned an empty list where the database had the
 * response — silently, and all the more often the bigger the project.
 */
export async function listTeamFeedback(
  projectId: string,
  options: { statuses?: readonly FeedbackPostStatus[] } = {}
): Promise<TeamFeedbackListItem[]> {
  const service = getServiceClient();
  let query = service
    .from("feedback_posts")
    .select(`${FEEDBACK_POST_SELECT}, author:feedback_users!author_id (${AUTHOR_SELECT}), ${CATEGORY_EMBED}`)
    .is("deleted_at", null)
    .eq("project_id", projectId)
    .is("merged_into_id", null);
  if (options.statuses?.length) {
    query = query.in("status", options.statuses as string[]);
  }
  const { data } = await query
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as (FeedbackPostRow & {
    author: TeamFeedbackAuthor | null;
  } & WithCategoryEmbed)[];

  const suggestionTitles = await fetchTitles(
    rows.map((r) => r.suggested_merge_into_id).filter((x): x is string => !!x)
  );

  const items = rows.map((row) => ({
    ...flattenCategories(row),
    suggested_title: row.suggested_merge_into_id
      ? (suggestionTitles.get(row.suggested_merge_into_id) ?? null)
      : null,
  }));
  // Completed (delivered / refused) at the bottom of the list, sorting by votes kept within
  // of each group — like on the public board.
  return sortFeedbackResolvedLast(items, (item) => item.status);
}

async function fetchTitles(postIds: string[]): Promise<Map<string, string>> {
  if (postIds.length === 0) return new Map();
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select("id, title")
    .is("deleted_at", null)
    .in("id", postIds);
  return new Map((data ?? []).map((p) => [p.id as string, p.title as string]));
}

export interface TeamMergeEvent {
  id: string;
  dup_id: string;
  dup_title: string | null;
  performed_by: "ai" | "team";
  confidence: number | null;
  created_at: string;
}

export interface TeamFeedbackDetail extends FeedbackPostRow {
  author: TeamFeedbackAuthor | null;
  suggested_title: string | null;
  category_ids: string[];
  merged_from: { id: string; title: string }[];
  /** Active (undoable) merges for which this post is the target — undoable. */
  merge_events: TeamMergeEvent[];
  issue: { id: string; number: number; status: string } | null;
}

export async function getTeamFeedbackDetail(
  projectId: string,
  postId: string
): Promise<TeamFeedbackDetail | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(`${FEEDBACK_POST_SELECT}, author:feedback_users!author_id (${AUTHOR_SELECT}), ${CATEGORY_EMBED}`)
    .is("deleted_at", null)
    .eq("id", postId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  const row = flattenCategories(
    data as unknown as FeedbackPostRow & {
      author: TeamFeedbackAuthor | null;
    } & WithCategoryEmbed
  );

  const [mergedFromRes, eventsRes, suggestionTitles, issueRes] = await Promise.all([
    service
      .from("feedback_posts")
      .select("id, title")
      .is("deleted_at", null)
      .eq("merged_into_id", postId)
      .order("created_at", { ascending: true }),
    service
      .from("feedback_merge_events")
      .select("id, dup_id, performed_by, confidence, created_at")
      .eq("canonical_id", postId)
      .eq("kind", "post")
      .is("undone_at", null)
      .order("created_at", { ascending: false }),
    fetchTitles(row.suggested_merge_into_id ? [row.suggested_merge_into_id] : []),
    row.issue_id
      ? service
          .from("issues")
          .select("id, number, status")
          .is("deleted_at", null)
          .eq("id", row.issue_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const mergedFrom = ((mergedFromRes.data ?? []) as { id: string; title: string }[]);
  const dupTitles = new Map(mergedFrom.map((p) => [p.id, p.title]));

  return {
    ...row,
    suggested_title: row.suggested_merge_into_id
      ? (suggestionTitles.get(row.suggested_merge_into_id) ?? null)
      : null,
    merged_from: mergedFrom,
    merge_events: ((eventsRes.data ?? []) as Omit<TeamMergeEvent, "dup_title">[]).map((e) => ({
      ...e,
      dup_title: dupTitles.get(e.dup_id) ?? null,
    })),
    issue: (issueRes.data as { id: string; number: number; status: string } | null) ?? null,
  };
}

// ── Feedback HANGING ON A TICKET (MIN-196) ──────────────────────────────

export type { IssueLinkedFeedback };

/**
 * The returns that a ticket implements. Several are possible: several
 * requests often converge on the same job.
 *
 * Customer service, always: `feedback_posts` is RLS deny-all, so a
 * read by the session client would return an EMPTY list instead of a
 * error. The caller has already proven their access to the project, we filter on it.
 */
export async function listFeedbackForIssue(
  projectId: string,
  issueId: string
): Promise<IssueLinkedFeedback[]> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("feedback_posts")
    .select("id, title, status, vote_count, is_public")
    .is("deleted_at", null)
    .eq("project_id", projectId)
    .eq("issue_id", issueId)
    // A merged duplicate only exists through its canonical: show it
    // would make two entries for a single request.
    .is("merged_into_id", null)
    .order("vote_count", { ascending: false });
  if (error) {
    console.error("[feedback-queries] by-issue failed:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as Omit<IssueLinkedFeedback, "comment_count">[];
  if (rows.length === 0) return [];

  const { data: commentRows } = await service
    .from("comments")
    .select("feedback_post_id")
    .in(
      "feedback_post_id",
      rows.map((r) => r.id)
    );
  const counts = new Map<string, number>();
  for (const c of (commentRows ?? []) as { feedback_post_id: string }[]) {
    counts.set(c.feedback_post_id, (counts.get(c.feedback_post_id) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, comment_count: counts.get(r.id) ?? 0 }));
}
