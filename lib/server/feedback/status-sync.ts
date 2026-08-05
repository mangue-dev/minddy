import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import type { FeedbackPostStatus } from "@/lib/feedback/types";
import type { IssueStatus } from "@/lib/issue-constants";

/**
 * Reflet du statut d'une issue liée sur son post de feedback (MIN-37).
 *
 * La table est TOTALE sur les statuts d'issue, et c'est tout l'enjeu : lier un
 * ticket à un retour, c'est déclarer que l'un dit l'autre. Une table partielle
 * en faisait des DÉCLENCHEURS — seuls done, in_progress, in_review et canceled
 * écrivaient, les autres transitions ne faisaient rien. Un ticket passé « en
 * cours » puis ramené au backlog laissait donc son retour « En cours » : le
 * board public annonçait un travail commencé que plus personne ne faisait, et
 * rien dans l'écran ne permettait de le corriger, le statut d'un retour lié
 * étant en lecture seule. Un lien qui ne tient que dans un sens n'est pas un
 * lien.
 *
 * Deux lectures méritent d'être dites :
 *
 * - **backlog → `open`**, et non « prévu ». Un ticket au backlog n'est pas
 *   planifié, il est reçu ; c'est `todo` qui est une promesse. Promouvoir un
 *   retour ne le fait donc plus passer « Prévu » d'office — il le devient quand
 *   son ticket est vraiment pris.
 * - **duplicate → `open`**. L'issue est un doublon, mais le besoin, lui, est
 *   toujours vivant et suivi ailleurs. « Décliné » dirait au public qu'on a
 *   dit non, ce qui est faux.
 *
 * Branché dans updateIssueFields — le chokepoint de tous les chemins de
 * mutation — et exécuté via after(), jamais sur le chemin de la réponse.
 */
export const ISSUE_TO_FEEDBACK_STATUS: Record<IssueStatus, FeedbackPostStatus> = {
  triage: "open",
  backlog: "open",
  todo: "planned",
  in_progress: "in_progress",
  in_review: "in_progress",
  done: "shipped",
  canceled: "declined",
  duplicate: "open",
};

/** Le statut public que porte un retour lié à une issue dans cet état. */
export function feedbackStatusForIssue(
  issueStatus: unknown
): FeedbackPostStatus | null {
  return typeof issueStatus === "string" &&
    Object.hasOwn(ISSUE_TO_FEEDBACK_STATUS, issueStatus)
    ? ISSUE_TO_FEEDBACK_STATUS[issueStatus as IssueStatus]
    : null;
}

export function scheduleFeedbackStatusSync(
  issueId: string,
  issueStatus: unknown,
  actorId: string | null = null
): void {
  // `null` seulement pour une valeur qui n'est pas un statut connu — pas pour
  // un statut qu'on aurait choisi d'ignorer : il n'y en a plus.
  const mapped = feedbackStatusForIssue(issueStatus);
  if (!mapped) return;
  afterOrNow(() =>
    syncFeedbackStatusForIssue(issueId, mapped, actorId).catch((e) =>
      console.error("[feedback-status-sync] failed:", (e as Error).message)
    )
  );
}

export async function syncFeedbackStatusForIssue(
  issueId: string,
  status: FeedbackPostStatus,
  actorId: string | null = null
): Promise<void> {
  const service = getServiceClient();
  // On lit les posts qui vont réellement changer pour ne journaliser que les
  // vraies transitions (from → to), attribuées au membre qui a bougé l'issue.
  const { data: affected } = await service
    .from("feedback_posts")
    .select("id, status")
    .is("deleted_at", null)
    .eq("issue_id", issueId)
    .neq("status", status);
  const { error } = await service
    .from("feedback_posts")
    .update({ status })
    .is("deleted_at", null)
    .eq("issue_id", issueId);
  if (error) {
    console.error("[feedback-status-sync] update failed:", error.message);
    return;
  }
  for (const post of affected ?? []) {
    await emitFeedbackFieldChanges(service, {
      postId: post.id as string,
      actorId,
      before: { status: post.status },
      updates: { status },
    });
  }
}
