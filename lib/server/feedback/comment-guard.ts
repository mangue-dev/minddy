import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Qui peut éditer ou supprimer un commentaire de retour (MIN-196).
 *
 * Extrait de la route pour être ATTEIGNABLE : c'est une règle de permission, la
 * seule de tout le feedback qui décide qui peut retirer quelque chose d'une page
 * publique, et une règle pareille doit pouvoir être exercée directement plutôt
 * que relue.
 *
 * Le feedback est RLS deny-all : contrairement aux commentaires de ticket, dont
 * la règle « auteur seulement, jamais ceux de Numo » est portée par des policies
 * Postgres, celle-ci n'existe qu'ici. L'appelant a déjà prouvé l'appartenance au
 * projet ; ce qui se décide à cet endroit, c'est le reste.
 *
 * **Supprimer un commentaire PUBLIC est ouvert à toute l'équipe**, quel qu'en
 * soit l'auteur — un visiteur, un collègue, Numo via respond_feedback, ou
 * personne (les réponses d'équipe reprises par la migration n'ont pas d'auteur).
 * La règle suit l'endroit où sont les mots, pas la main qui les a tapés : ils
 * sont sur une page que l'équipe publie en son nom. Réservée à l'auteur, elle
 * laissait un propos abusif en ligne jusqu'à son retour, rendait irrécupérable
 * la réponse d'un collègue parti, et laissait les réponses migrées —
 * sans auteur par construction — supprimables par personne.
 *
 * **Éditer reste à l'auteur.** Réécrire les mots d'un autre sous son nom n'est
 * pas de la modération ; ceux d'un VISITEUR ne se réécrivent jamais, par
 * personne. Corriger une coquille dans sa propre réponse publiée, en revanche,
 * reste permis.
 *
 * Les notes INTERNES gardent la règle d'origine des deux côtés : une
 * conversation entre pairs n'est pas une publication.
 */
export type FeedbackCommentGuard = { ok: true } | { ok: false; status: number };

export async function guardFeedbackComment(
  service: SupabaseClient,
  params: {
    postId: string;
    commentId: string;
    userId: string;
    /** `delete` ouvre la modération d'équipe ; `edit` reste à l'auteur. */
    mode: "edit" | "delete";
  }
): Promise<FeedbackCommentGuard> {
  const { data } = await service
    .from("comments")
    .select("id, author_id, via_assistant, feedback_post_id, feedback_user_id, visibility")
    .eq("id", params.commentId)
    .maybeSingle();
  // Absent, ou rattaché à un AUTRE retour : invisible plutôt qu'interdit.
  if (!data || data.feedback_post_id !== params.postId) {
    return { ok: false, status: 404 };
  }

  if (params.mode === "delete" && data.visibility === "public") return { ok: true };
  // Les mots d'un visiteur ne se réécrivent pas, même par l'équipe.
  if (data.feedback_user_id !== null) return { ok: false, status: 403 };
  // Pas l'auteur, ou un commentaire de Numo → pas à vous de le toucher.
  if (data.author_id !== params.userId || data.via_assistant) {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}
