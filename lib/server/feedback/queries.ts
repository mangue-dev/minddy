import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  sortFeedbackResolvedLast,
  type FeedbackPostStatus,
  type PublicPost,
} from "@/lib/feedback/types";
import type { FeedbackPostRow } from "@/lib/server/feedback/posts";
import { FEEDBACK_POST_SELECT } from "@/lib/server/feedback/posts";

/**
 * Lectures du board public (MIN-37). Tout passe par le service client (RLS
 * deny-all) ; l'anonymisation se fait ICI : seuls les pseudonymes sortent,
 * jamais l'email ni le nom. Le board ne montre que les posts canoniques —
 * un post mergé n'existe publiquement qu'à travers sa redirection.
 */

const PUBLIC_LIST_LIMIT = 200;

export type PublicSort = "top" | "recent";

interface PostWithAuthor extends FeedbackPostRow {
  feedback_users: { pseudonym: string } | null;
}

// Hint !author_id obligatoire : PostgREST voit aussi un chemin many-to-many
// posts↔users via feedback_votes, l'embed nu serait ambigu (PGRST201).
const PUBLIC_POST_SELECT = `${FEEDBACK_POST_SELECT}, feedback_users!author_id (pseudonym)`;

function toPublicPost(
  row: PostWithAuthor,
  viewerId: string | null,
  votedPostIds: Set<string>
): PublicPost {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    isPublic: row.is_public,
    voteCount: row.vote_count,
    createdAt: row.created_at,
    authorPseudonym: row.feedback_users?.pseudonym ?? null,
    isMine: viewerId !== null && row.author_id === viewerId,
    votedByMe: votedPostIds.has(row.id),
    teamResponse: row.team_response,
    teamResponseAt: row.team_response_at,
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
  status?: FeedbackPostStatus | null;
}): Promise<PublicPost[]> {
  const service = getServiceClient();
  let query = service
    .from("feedback_posts")
    .select(PUBLIC_POST_SELECT)
    .eq("project_id", params.projectId)
    .is("merged_into_id", null)
    // Les retours privés remontent à l'équipe mais ne sont jamais listés ici.
    .eq("is_public", true)
    .limit(PUBLIC_LIST_LIMIT);
  if (params.status) query = query.eq("status", params.status);
  query =
    params.sort === "top"
      ? query.order("vote_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) console.error("[feedback-queries] list failed:", error.message);
  const rows = (data ?? []) as unknown as PostWithAuthor[];
  const ids = rows.map((r) => r.id);
  const voted = await fetchViewerVotes(params.viewerId, ids);
  const posts = rows.map((r) => toPublicPost(r, params.viewerId, voted));
  // Terminés (livrés / refusés) rangés en bas, l'ordre choisi (votes/date)
  // conservé au sein de chaque groupe.
  return sortFeedbackResolvedLast(posts, (p) => p.status);
}

export interface PublicPostDetail {
  post: PublicPost;
  /** Renseigné si CE post est un tombstone : rediriger vers le canonique. */
  mergedIntoId: string | null;
  /** Titres des posts fusionnés dans celui-ci (mention « fusionné depuis »). */
  mergedFromTitles: string[];
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
    .eq("id", params.postId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as PostWithAuthor;
  // Retour privé : seul son auteur peut l'ouvrir (les autres → 404). Il reste
  // visible côté équipe via l'onglet feedback du projet.
  if (!row.is_public && row.author_id !== params.viewerId) return null;
  if (row.merged_into_id !== null) {
    // Tombstone : le canonique porte tout, l'appelant redirige.
    return {
      post: toPublicPost(row, params.viewerId, new Set<string>()),
      mergedIntoId: row.merged_into_id,
      mergedFromTitles: [],
    };
  }

  const [voted, mergedFromRes] = await Promise.all([
    fetchViewerVotes(params.viewerId, [row.id]),
    service
      .from("feedback_posts")
      .select("title")
      .eq("merged_into_id", row.id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    post: toPublicPost(row, params.viewerId, voted),
    mergedIntoId: null,
    mergedFromTitles: (mergedFromRes.data ?? []).map((p) => p.title as string),
  };
}

export interface MyFeedbackEntry {
  /** Post à afficher (le canonique si le mien a été fusionné). */
  post: PublicPost;
  relation: "authored" | "voted";
  /** Titre soumis à l'origine quand mon post a été fusionné dans un autre. */
  mergedFromTitle: string | null;
}

/** « Mes feedbacks » : mes posts (y compris fusionnés — suivis jusqu'au
    canonique) et mes votes, avec leur avancement. */
export async function listMyFeedback(params: {
  projectId: string;
  viewerId: string;
}): Promise<MyFeedbackEntry[]> {
  const service = getServiceClient();

  const [authoredRes, votedRes] = await Promise.all([
    service
      .from("feedback_posts")
      .select(PUBLIC_POST_SELECT)
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

  // Mes posts fusionnés : suivre le pointeur (profondeur ≤ 1 par aplatissement).
  const mergedTargets = authored
    .map((p) => p.merged_into_id)
    .filter((id): id is string => id !== null);
  const canonicalById = new Map<string, PostWithAuthor>();
  if (mergedTargets.length > 0) {
    const { data } = await service
      .from("feedback_posts")
      .select(PUBLIC_POST_SELECT)
      .in("id", mergedTargets);
    for (const row of (data ?? []) as unknown as PostWithAuthor[]) {
      canonicalById.set(row.id, row);
    }
  }

  const entries: { row: PostWithAuthor; relation: "authored" | "voted"; mergedFromTitle: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of authored) {
    const canonical = row.merged_into_id ? canonicalById.get(row.merged_into_id) : null;
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
    // Les votes suivent déjà le merge (déplacés vers le canonique) ; un
    // tombstone voté ne devrait pas exister, on l'ignore par sécurité.
    if (!row || row.merged_into_id !== null || seen.has(row.id)) continue;
    seen.add(row.id);
    entries.push({ row, relation: "voted", mergedFromTitle: null });
  }

  const ids = entries.map((e) => e.row.id);
  const voted = await fetchViewerVotes(params.viewerId, ids);
  return entries.map((e) => ({
    post: toPublicPost(e.row, params.viewerId, voted),
    relation: e.relation,
    mergedFromTitle: e.mergedFromTitle,
  }));
}
