import "server-only";

import { cache } from "react";
import { getServiceClient } from "@/lib/supabase-service";
import {
  isHiddenFeedbackStatus,
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
    reviewState: row.review_state,
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
  /**
   * Les statuts à garder (`publicFilterStatuses`) — `null`/absent = tous. Une
   * LISTE et non un statut : le filtre par défaut du board en groupe trois
   * (ouvert, prévu, en cours), et le faire côté SQL évite de charger l'archive
   * pour la jeter ensuite.
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
    // Les retours privés remontent à l'équipe mais ne sont jamais listés ici.
    .eq("is_public", true)
    // Revue avant publication (MIN-54) : un post en attente n'apparaît pas.
    .eq("review_state", "published")
    // Le spam n'a jamais de page publique — c'est ce que le statut décide.
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
  const voted = await fetchViewerVotes(
    params.viewerId,
    rows.map((r) => r.id)
  );
  const posts = rows.map((r) => toPublicPost(r, params.viewerId, voted));
  // Terminés (livrés / refusés) rangés en bas, l'ordre choisi (votes/date)
  // conservé au sein de chaque groupe.
  return sortFeedbackResolvedLast(posts, (p) => p.status);
}

/**
 * Le board a-t-il seulement un retour public ?
 *
 * À n'appeler QUE quand la liste rend zéro ligne, et pour une seule raison :
 * distinguer les deux vides. Un board neuf doit lire « soyez le premier » ; un
 * board dont tout est livré ou décliné doit lire « rien ne correspond à ce
 * filtre » — sinon on lui annonce qu'il est vide devant vingt retours traités,
 * et le visiteur n'a aucune raison d'aller chercher « tous ».
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

  const [voted, mergedFromRes] = await Promise.all([
    fetchViewerVotes(params.viewerId, [row.id]),
    service
      .from("feedback_posts")
      .select("title")
      .is("deleted_at", null)
      .eq("merged_into_id", row.id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    post: toPublicPost(row, params.viewerId, voted),
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

/**
 * « Mes feedbacks » : mes posts (y compris fusionnés — suivis jusqu'au
 * canonique) et mes votes, avec leur avancement.
 *
 * Un retour privé n'y entre que si je l'ai ÉCRIT. Privé veut dire « lu par
 * l'équipe seule » : le voir dans sa liste parce qu'on a voté dessus avant que
 * l'équipe ne le retire du board, ou parce que le sien y a été fusionné, c'est
 * lire le retour de quelqu'un d'autre à un endroit où le board a promis qu'on
 * ne le lirait pas.
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

  /** Lisible ici seulement si public, ou écrit par moi. */
  const readable = (row: PostWithAuthor) =>
    row.is_public || row.author_id === params.viewerId;

  const entries: { row: PostWithAuthor; relation: "authored" | "voted"; mergedFromTitle: string | null }[] = [];
  const seen = new Set<string>();
  for (const row of authored) {
    // Mon retour fusionné dans le retour PRIVÉ d'un autre : on ne suit pas le
    // pointeur, on reste sur le mien. Suivre montrerait son titre et son
    // avancement — précisément ce que « privé » retire de ma vue.
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
    // Les votes suivent déjà le merge (déplacés vers le canonique) ; un
    // tombstone voté ne devrait pas exister, on l'ignore par sécurité.
    if (!row || row.merged_into_id !== null || seen.has(row.id)) continue;
    // Voté puis passé en privé par l'équipe : il sort de la liste comme il est
    // sorti du board.
    if (!readable(row)) continue;
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
