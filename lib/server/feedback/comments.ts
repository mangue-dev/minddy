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
 * Le fil PUBLIC d'un retour (MIN-196) — le pendant board de
 * `lib/server/feedback/queries.ts`, dont il reprend la règle : tout passe par
 * le service client (les commentaires de retour ne matchent aucune policy), et
 * l'anonymisation se fait ICI, à la source. Ce qui sort de ce module ne porte
 * jamais d'email ni de nom, seulement un pseudonyme en graine d'avatar.
 *
 * Une seule règle de lecture, valable partout : un commentaire public SANS
 * `feedback_user_id` est la voix de l'équipe. C'est le cas des réponses écrites
 * depuis la vue équipe (`author_id` renseigné, mais jamais publié) comme des
 * anciennes `team_response` reprises par la migration (ni l'un ni l'autre).
 */

/** Fil plat : un retour n'est pas un forum, on ne threade pas les réponses. */
const PUBLIC_THREAD_LIMIT = 200;

interface PublicCommentRow {
  id: string;
  body: string;
  created_at: string;
  feedback_user_id: string | null;
  feedback_users: { pseudonym: string } | null;
}

const PUBLIC_COMMENT_SELECT =
  "id, body, created_at, feedback_user_id, feedback_users!feedback_user_id (pseudonym)";

function toPublicComment(row: PublicCommentRow, viewerId: string | null): PublicComment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorSeed: row.feedback_users?.pseudonym ?? null,
    isTeam: row.feedback_user_id === null,
    isMine: viewerId !== null && row.feedback_user_id === viewerId,
  };
}

/** Le fil public d'un retour, du plus ancien au plus récent. */
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
  /** Dernier commentaire de l'ÉQUIPE — ce que le badge du board annonce. */
  teamRepliedAt: string | null;
}

/** Un objet NEUF à chaque appel : le résumé est accumulé en place plus bas, et
    une constante partagée finirait par compter les commentaires de tout le
    board sur le premier retour venu. */
export function emptyCommentSummary(): PublicCommentSummary {
  return { count: 0, teamRepliedAt: null };
}

/**
 * De quoi peindre une LISTE de retours sans ouvrir un seul fil : combien de
 * commentaires, et quand l'équipe a parlé pour la dernière fois.
 *
 * Une requête pour toute la page — un board rend jusqu'à 200 lignes, et une
 * lecture par ligne rendrait la liste plus chère que tout le reste du board.
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
 * Un visiteur ajoute un commentaire au fil public.
 *
 * Trois refus, et ils ne disent pas la même chose : `closed` = le board ne
 * prend plus de commentaires (réglage du projet), `notFound` = ce retour n'a
 * pas de page publique (privé, en attente de revue, écarté, ou fusionné dans un
 * autre) — le même signal que celui que rend `getPublicPostDetail`, pour ne pas
 * annoncer par la bande l'existence d'un retour qu'on ne montre pas.
 */
export async function addPublicComment(params: {
  projectId: string;
  boardAllowsComments: boolean;
  postId: string;
  feedbackUserId: string;
  body: string;
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

  const { data, error } = await service
    .from("comments")
    .insert({
      feedback_post_id: params.postId,
      author_id: null,
      feedback_user_id: params.feedbackUserId,
      body: text,
      visibility: "public",
    })
    .select(PUBLIC_COMMENT_SELECT)
    .single();
  if (error || !data) {
    console.error("[feedback-comments] create failed:", error?.message);
    return { ok: false, error: "failed" };
  }

  // L'équipe doit APPRENDRE qu'on lui a répondu sur le board : sans ça, un fil
  // public ne vit que si quelqu'un pense à aller le relire. L'acteur reste nul
  // — le commentateur est un visiteur, pas un membre, et son identité ne
  // remonte pas dans le fil de notifications.
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
 * Un visiteur retire SON commentaire. L'égalité sur `feedback_user_id` est la
 * garde : elle exclut du même coup les commentaires des autres et ceux de
 * l'équipe (qui n'en portent pas). La modération d'équipe, elle, passe par la
 * route interne — même table, autre porte.
 */
export async function deletePublicComment(params: {
  postId: string;
  commentId: string;
  feedbackUserId: string;
}): Promise<boolean> {
  const service = getServiceClient();
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
