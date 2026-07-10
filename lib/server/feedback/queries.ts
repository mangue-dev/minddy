import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type {
  FeedbackPostStatus,
  PublicFacet,
  PublicPost,
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
/** Pills de facettes affichées par post sur la liste (carrousel). */
const FACET_PILLS_PER_POST = 8;

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
  votedPostIds: Set<string>,
  facetCounts: Map<string, number>,
  facets: PublicFacet[] = []
): PublicPost {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    voteCount: row.vote_count,
    facetCount: facetCounts.get(row.id) ?? 0,
    facets,
    createdAt: row.created_at,
    authorPseudonym: row.feedback_users?.pseudonym ?? null,
    isMine: viewerId !== null && row.author_id === viewerId,
    votedByMe: votedPostIds.has(row.id),
    teamResponse: row.team_response,
    teamResponseAt: row.team_response_at,
  };
}

/** Facettes vivantes des posts listés, triées par voix, plafonnées par post,
    avec les votes du visiteur — la matière des pills du carrousel. */
async function fetchFacetPills(
  postIds: string[],
  viewerId: string | null
): Promise<{ byPost: Map<string, PublicFacet[]>; counts: Map<string, number> }> {
  const byPost = new Map<string, PublicFacet[]>();
  const counts = new Map<string, number>();
  if (postIds.length === 0) return { byPost, counts };

  const service = getServiceClient();
  const { data } = await service
    .from("feedback_facets")
    .select("id, post_id, text, vote_count, created_by")
    .in("post_id", postIds)
    .is("merged_into_id", null)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as {
    id: string;
    post_id: string;
    text: string;
    vote_count: number;
    created_by: string | null;
  }[];

  let myVotes = new Set<string>();
  if (viewerId && rows.length > 0) {
    const { data: fv } = await service
      .from("feedback_facet_votes")
      .select("facet_id")
      .eq("user_id", viewerId)
      .in("facet_id", rows.map((r) => r.id));
    myVotes = new Set((fv ?? []).map((v) => v.facet_id as string));
  }

  for (const row of rows) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
    const pills = byPost.get(row.post_id) ?? [];
    if (pills.length >= FACET_PILLS_PER_POST) continue;
    pills.push({
      id: row.id,
      text: row.text,
      voteCount: row.vote_count,
      votedByMe: myVotes.has(row.id),
      isMine: viewerId !== null && row.created_by === viewerId,
    });
    byPost.set(row.post_id, pills);
  }
  return { byPost, counts };
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
  const [voted, pills] = await Promise.all([
    fetchViewerVotes(params.viewerId, ids),
    fetchFacetPills(ids, params.viewerId),
  ]);
  return rows.map((r) =>
    toPublicPost(r, params.viewerId, voted, pills.counts, pills.byPost.get(r.id) ?? [])
  );
}

export interface PublicPostDetail {
  post: PublicPost;
  /** Renseigné si CE post est un tombstone : rediriger vers le canonique. */
  mergedIntoId: string | null;
  facets: PublicFacet[];
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
  if (row.merged_into_id !== null) {
    // Tombstone : le canonique porte tout, l'appelant redirige.
    const [voted, facetCounts] = [new Set<string>(), new Map<string, number>()];
    return {
      post: toPublicPost(row, params.viewerId, voted, facetCounts),
      mergedIntoId: row.merged_into_id,
      facets: [],
      mergedFromTitles: [],
    };
  }

  const [voted, facetCounts, facetsRes, mergedFromRes] = await Promise.all([
    fetchViewerVotes(params.viewerId, [row.id]),
    fetchFacetCounts([row.id]),
    service
      .from("feedback_facets")
      .select("id, text, vote_count, created_by")
      .eq("post_id", row.id)
      .is("merged_into_id", null)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true }),
    service
      .from("feedback_posts")
      .select("title")
      .eq("merged_into_id", row.id)
      .order("created_at", { ascending: true }),
  ]);

  const facetRows = (facetsRes.data ?? []) as {
    id: string;
    text: string;
    vote_count: number;
    created_by: string | null;
  }[];
  let myFacetVotes = new Set<string>();
  if (params.viewerId && facetRows.length > 0) {
    const { data: fv } = await service
      .from("feedback_facet_votes")
      .select("facet_id")
      .eq("user_id", params.viewerId)
      .in("facet_id", facetRows.map((f) => f.id));
    myFacetVotes = new Set((fv ?? []).map((v) => v.facet_id as string));
  }

  return {
    post: toPublicPost(row, params.viewerId, voted, facetCounts),
    mergedIntoId: null,
    facets: facetRows.map((f) => ({
      id: f.id,
      text: f.text,
      voteCount: f.vote_count,
      votedByMe: myFacetVotes.has(f.id),
      isMine: params.viewerId !== null && f.created_by === params.viewerId,
    })),
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
  const [voted, facetCounts] = await Promise.all([
    fetchViewerVotes(params.viewerId, ids),
    fetchFacetCounts(ids),
  ]);
  return entries.map((e) => ({
    post: toPublicPost(e.row, params.viewerId, voted, facetCounts),
    relation: e.relation,
    mergedFromTitle: e.mergedFromTitle,
  }));
}

/** Nombre de facettes vivantes d'un post (seuil du check de similarité). */
export async function countLiveFacets(postId: string): Promise<number> {
  const service = getServiceClient();
  const { count } = await service
    .from("feedback_facets")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
    .is("merged_into_id", null);
  return count ?? 0;
}
