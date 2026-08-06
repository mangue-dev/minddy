import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getBoardForProject } from "@/lib/server/feedback/boards";

/**
 * Effacement d'un participant de board (RGPD art. 17).
 *
 * L'éditeur du board est responsable de traitement pour les gens qui y
 * participent ; minddy est son sous-traitant. Quand une demande d'effacement lui
 * arrive, c'est donc à lui de l'exécuter — et jusqu'ici il n'avait rien pour le
 * faire : aucune suppression d'identité n'existait dans le produit.
 *
 * Ce qui part : email, nom, external_id, les codes de vérification en attente,
 * et toutes les sessions ouvertes. Ce qui reste : la ligne, opaque, portant un
 * uuid et le pseudonyme qui en dérive. Le POURQUOI de ce choix est au long dans
 * la migration `20261110090000_feedback_erasure.sql` — en une phrase : supprimer
 * la ligne ferait passer les commentaires publics de la personne pour ceux de
 * l'équipe, emporterait au passage les réponses des autres, et changerait
 * rétroactivement le poids des retours qu'elle avait soutenus.
 *
 * Idempotent : effacer deux fois la même identité ne fait rien la seconde fois
 * et rend le même compte-rendu.
 */

export interface FeedbackErasureReport {
  userId: string;
  /** Déjà effacée avant cet appel — rien n'a été retouché. */
  alreadyErased: boolean;
  /** Contributions restées en ligne, désormais sans auteur identifiable. */
  posts: number;
  comments: number;
  votes: number;
  /** Sessions révoquées (le visiteur est déconnecté de partout). */
  sessions: number;
}

export type FeedbackErasureResult =
  | { ok: true; report: FeedbackErasureReport }
  | { ok: false; error: "notFound" | "failed" };

export async function eraseFeedbackUser(params: {
  projectId: string;
  userId: string;
}): Promise<FeedbackErasureResult> {
  const service = getServiceClient();

  // `project_id` fait partie du filtre, pas seulement de la lecture : la route
  // porte un identifiant de projet et un identifiant d'identité, et rien
  // n'interdirait sinon d'effacer l'identité d'un board voisin.
  const { data: user } = await service
    .from("feedback_users")
    .select("id, project_id, email, erased_at")
    .eq("id", params.userId)
    .eq("project_id", params.projectId)
    .maybeSingle();
  if (!user) return { ok: false, error: "notFound" };

  const [posts, comments, votes] = await Promise.all([
    countRows(service, "feedback_posts", "author_id", params.userId),
    countRows(service, "comments", "feedback_user_id", params.userId),
    countRows(service, "feedback_votes", "user_id", params.userId),
  ]);

  if (user.erased_at) {
    return {
      ok: true,
      report: {
        userId: params.userId,
        alreadyErased: true,
        posts,
        comments,
        votes,
        sessions: 0,
      },
    };
  }

  // Les sessions d'abord : tant que le cookie vaut, son porteur continuerait de
  // se voir « connecté » sous une identité qu'on est en train de vider.
  const { count: sessions } = await service
    .from("feedback_sessions")
    .delete({ count: "exact" })
    .eq("user_id", params.userId);

  // Un code en attente porte l'adresse en clair. Il expire en dix minutes et le
  // balayage nocturne le ramasse — mais « dans dix minutes » n'est pas une
  // réponse à une demande d'effacement.
  if (user.email) {
    const board = await getBoardForProject(params.projectId);
    if (board) {
      await service
        .from("feedback_otp_codes")
        .delete()
        .eq("board_id", board.id)
        .eq("email", user.email);
    }
  }

  const { error } = await service
    .from("feedback_users")
    .update({
      email: null,
      name: null,
      external_id: null,
      erased_at: new Date().toISOString(),
    })
    .eq("id", params.userId);
  if (error) {
    console.error("[feedback-erasure] scrub failed:", error.message);
    return { ok: false, error: "failed" };
  }

  return {
    ok: true,
    report: {
      userId: params.userId,
      alreadyErased: false,
      posts,
      comments,
      votes,
      sessions: sessions ?? 0,
    },
  };
}

/** `select("*")` et non `select("id")` : `feedback_votes` n'a pas de colonne
    `id` (sa clé primaire est le couple post/identité), et une colonne absente
    fait échouer le comptage au lieu de rendre zéro. */
async function countRows(
  service: ReturnType<typeof getServiceClient>,
  table: string,
  column: string,
  userId: string
): Promise<number> {
  const { count } = await service
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, userId);
  return count ?? 0;
}
