import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";

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

export interface TeamFeedbackListItem extends FeedbackPostRow {
  author: TeamFeedbackAuthor | null;
  facet_count: number;
  suggested_title: string | null;
}

export async function listTeamFeedback(projectId: string): Promise<TeamFeedbackListItem[]> {
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_posts")
    .select(`${FEEDBACK_POST_SELECT}, author:feedback_users!author_id (${AUTHOR_SELECT})`)
    .eq("project_id", projectId)
    .is("merged_into_id", null)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as (FeedbackPostRow & {
    author: TeamFeedbackAuthor | null;
  })[];
  const ids = rows.map((r) => r.id);

  const [facetCounts, suggestionTitles] = await Promise.all([
    fetchFacetCounts(ids),
    fetchTitles(rows.map((r) => r.suggested_merge_into_id).filter((x): x is string => !!x)),
  ]);

  return rows.map((row) => ({
    ...row,
    facet_count: facetCounts.get(row.id) ?? 0,
    suggested_title: row.suggested_merge_into_id
      ? (suggestionTitles.get(row.suggested_merge_into_id) ?? null)
      : null,
  }));
}

async function fetchFacetCounts(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0) return new Map();
  const service = getServiceClient();
  const { data } = await service
    .from("feedback_facets")
    .select("post_id")
    .in("post_id", postIds)
    .is("merged_into_id", null);
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const id = row.post_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
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

export interface TeamFacet {
  id: string;
  text: string;
  submitted_text: string | null;
  vote_count: number;
  source: "ai" | "user" | "team";
  review_flag: "root_disguised" | null;
  created_at: string;
  author: TeamFeedbackAuthor | null;
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
  facets: TeamFacet[];
  suggested_title: string | null;
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
    .select(`${FEEDBACK_POST_SELECT}, author:feedback_users!author_id (${AUTHOR_SELECT})`)
    .eq("id", postId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as FeedbackPostRow & { author: TeamFeedbackAuthor | null };

  const [facetsRes, mergedFromRes, eventsRes, suggestionTitles, issueRes] = await Promise.all([
    service
      .from("feedback_facets")
      .select(
        `id, text, submitted_text, vote_count, source, review_flag, created_at, author:feedback_users!created_by (${AUTHOR_SELECT})`
      )
      .eq("post_id", postId)
      .is("merged_into_id", null)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true }),
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
    facets: ((facetsRes.data ?? []) as unknown as TeamFacet[]).map((f) => ({ ...f })),
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
