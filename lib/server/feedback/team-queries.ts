import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";
import { sortFeedbackResolvedLast } from "@/lib/feedback/types";

/**
 * Lectures côté équipe (MIN-37) — contrairement au board public, les vraies
 * identités sortent ici (nom, email, external_id) : c'est le canal de
 * recontact. Les checks membre sont faits par les routes appelantes.
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

/** Embed N–N des catégories (MIN-52) — aplati en `category_ids` côté client. */
const CATEGORY_EMBED = "feedback_post_categories(category_id)";

type WithCategoryEmbed = { feedback_post_categories?: { category_id: string }[] | null };

/** Aplati l'embed jonction en liste d'ids, puis retire le champ brut du row. */
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

export async function listTeamFeedback(projectId: string): Promise<TeamFeedbackListItem[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(`${FEEDBACK_POST_SELECT}, author:feedback_users!author_id (${AUTHOR_SELECT}), ${CATEGORY_EMBED}`)
    .eq("project_id", projectId)
    .is("merged_into_id", null)
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
  // Terminés (livrés / refusés) en bas de liste, tri par votes conservé au sein
  // de chaque groupe — comme sur le board public.
  return sortFeedbackResolvedLast(items, (item) => item.status);
}

async function fetchTitles(postIds: string[]): Promise<Map<string, string>> {
  if (postIds.length === 0) return new Map();
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select("id, title")
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
  /** Fusions actives (non défaites) dont ce post est la cible — undoable. */
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
