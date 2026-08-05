import "server-only";

import { cache } from "react";
import { getServiceClient } from "@/lib/supabase-service";
import {
  isHiddenFeedbackStatus,
  sortFeedbackResolvedLast,
  type FeedbackPostStatus,
  type PublicCategory,
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
  votedPostIds: Set<string>,
  categories: PublicCategory[] = []
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
    teamResponse: row.team_response,
    teamResponseAt: row.team_response_at,
    categories,
  };
}

/**
 * Résout les catégories publiques (MIN-52) d'un lot de posts, uniquement quand
 * le board les expose (`include`). Deux lectures : les liens de jonction et les
 * catégories du projet ; renvoie une map post_id → catégories triées par nom.
 */
async function fetchPostCategories(
  projectId: string,
  postIds: string[],
  include: boolean
): Promise<Map<string, PublicCategory[]>> {
  if (!include || postIds.length === 0) return new Map();
  const service = getServiceClient();
  const [linksRes, catsRes] = await Promise.all([
    service
      .from("feedback_post_categories")
      .select("post_id, category_id")
      .in("post_id", postIds),
    service.from("categories").select("id, name, color").eq("project_id", projectId),
  ]);
  const catById = new Map<string, PublicCategory>(
    (catsRes.data ?? []).map((c) => [
      c.id as string,
      { id: c.id as string, name: c.name as string, color: c.color as string },
    ])
  );
  const byPost = new Map<string, PublicCategory[]>();
  for (const link of (linksRes.data ?? []) as { post_id: string; category_id: string }[]) {
    const cat = catById.get(link.category_id);
    if (!cat) continue;
    const arr = byPost.get(link.post_id) ?? [];
    arr.push(cat);
    byPost.set(link.post_id, arr);
  }
  for (const arr of byPost.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
  return byPost;
}

/**
 * Catégories réellement portées par au moins un post public du board (MIN-52) —
 * la matière des filtres par catégorie affichés sous « Partager un retour ». On
 * n'expose que celles utilisées : pas de filtre mort. Indépendant du filtre
 * courant (calculé sur tous les posts publics), pour rester stable en filtrant.
 */
export async function listPublicCategories(projectId: string): Promise<PublicCategory[]> {
  const service = getServiceClient();
  const { data: posts } = await service
    .from("feedback_posts")
    .select("id")
    .is("deleted_at", null)
    .eq("project_id", projectId)
    .eq("is_public", true)
    .eq("review_state", "published")
    .neq("status", "spam")
    .is("merged_into_id", null);
  const postIds = (posts ?? []).map((p) => p.id as string);
  if (postIds.length === 0) return [];
  const { data: links } = await service
    .from("feedback_post_categories")
    .select("category_id")
    .in("post_id", postIds);
  const usedIds = [...new Set((links ?? []).map((l) => l.category_id as string))];
  if (usedIds.length === 0) return [];
  const { data: cats } = await service
    .from("categories")
    .select("id, name, color")
    .eq("project_id", projectId)
    .in("id", usedIds);
  return (cats ?? [])
    .map((c) => ({ id: c.id as string, name: c.name as string, color: c.color as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
  /** Board.show_categories : n'expose les catégories que si activé (MIN-52). */
  includeCategories?: boolean;
  /** Filtre par catégorie (MIN-52) — ne garde que les posts qui la portent. */
  categoryId?: string | null;
}): Promise<PublicPost[]> {
  const service = getServiceClient();
  let query = service
    .from("feedback_posts")
    .select(PUBLIC_POST_SELECT)
    .is("deleted_at", null)
    .eq("project_id", params.projectId)
    .is("merged_into_id", null)
    // Les retours privés remontent à l'équipe mais ne sont jamais listés ici.
    .eq("is_public", true)
    // Revue avant publication (MIN-54) : un post en attente n'apparaît pas.
    .eq("review_state", "published")
    // Le spam n'a jamais de page publique — c'est ce que le statut décide.
    .neq("status", "spam")
    .limit(PUBLIC_LIST_LIMIT);
  if (params.status) query = query.eq("status", params.status);
  if (params.categoryId) {
    // Les ids des posts portant cette catégorie, restreints ensuite par .in().
    const { data: links } = await service
      .from("feedback_post_categories")
      .select("post_id")
      .eq("category_id", params.categoryId);
    const ids = (links ?? []).map((l) => l.post_id as string);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }
  query =
    params.sort === "top"
      ? query.order("vote_count", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) console.error("[feedback-queries] list failed:", error.message);
  const rows = (data ?? []) as unknown as PostWithAuthor[];
  const ids = rows.map((r) => r.id);
  const [voted, categoriesByPost] = await Promise.all([
    fetchViewerVotes(params.viewerId, ids),
    fetchPostCategories(params.projectId, ids, params.includeCategories ?? false),
  ]);
  const posts = rows.map((r) =>
    toPublicPost(r, params.viewerId, voted, categoriesByPost.get(r.id) ?? [])
  );
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
  /** Board.show_categories : n'expose les catégories que si activé (MIN-52). */
  includeCategories?: boolean;
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
  // Visible publiquement uniquement si public, publié ET pas en spam
  // (MIN-54/MIN-37). Un post privé, en attente de revue ou écarté n'est ouvrable
  // que par son auteur ; les autres → 404. Tout reste visible côté équipe via
  // l'onglet des retours du projet.
  const publiclyVisible =
    row.is_public && row.review_state === "published" && !isHiddenFeedbackStatus(row.status);
  if (!publiclyVisible && row.author_id !== params.viewerId) return null;
  if (row.merged_into_id !== null) {
    // Tombstone : le canonique porte tout, l'appelant redirige.
    return {
      post: toPublicPost(row, params.viewerId, new Set<string>()),
      mergedIntoId: row.merged_into_id,
      mergedFromTitles: [],
    };
  }

  const [voted, mergedFromRes, categoriesByPost] = await Promise.all([
    fetchViewerVotes(params.viewerId, [row.id]),
    service
      .from("feedback_posts")
      .select("title")
      .is("deleted_at", null)
      .eq("merged_into_id", row.id)
      .order("created_at", { ascending: true }),
    fetchPostCategories(params.projectId, [row.id], params.includeCategories ?? false),
  ]);

  return {
    post: toPublicPost(row, params.viewerId, voted, categoriesByPost.get(row.id) ?? []),
    mergedIntoId: null,
    mergedFromTitles: (mergedFromRes.data ?? []).map((p) => p.title as string),
  };
}

/**
 * Titre et corps d'un post, pour les métadonnées de sa page (MIN-95).
 *
 * Volontairement plus strict que `getPublicPostDetail` : celui-ci laisse son
 * AUTEUR ouvrir un post privé ou en attente de revue, ce qui est juste pour la
 * page — mais un `<title>` ou un `og:description` part dans l'aperçu de lien de
 * qui reçoit l'URL, pas seulement dans l'onglet de l'auteur. Seuls les posts
 * publiquement visibles nomment donc leur page ; les autres retombent sur le
 * titre générique du board.
 *
 * `cache()` sur des arguments primitifs : deux appels dans la même requête
 * (aucun aujourd'hui, mais la page en fera peut-être un) ne coûtent qu'une
 * lecture.
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
    // Un doublon fusionné redirige en 308 vers son canonique : c'est ce
    // dernier qui nomme la page.
    if (data.merged_into_id !== null) return null;
    return { title: data.title as string, body: (data.body as string) ?? "" };
  },
);

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

  // Mes posts fusionnés : suivre le pointeur (profondeur ≤ 1 par aplatissement).
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
