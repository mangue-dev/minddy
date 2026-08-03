import "server-only";

import { afterOrNow } from "@/lib/server/after-safe";
import { getServiceClient } from "@/lib/supabase-service";
import { emitFeedbackFieldChanges } from "@/lib/server/feedback/events";
import type { FeedbackPostStatus } from "@/lib/feedback/types";

/**
 * Reflet du statut d'une issue liée sur son post de feedback (MIN-37).
 * Mapping : done→shipped, in_progress/in_review→in_progress,
 * canceled→declined ; toute autre transition d'issue (triage/backlog/todo/
 * duplicate) est un no-op — le post garde sa valeur, posée manuellement par
 * l'équipe. Branché dans updateIssueFields — le chokepoint de tous les
 * chemins de mutation — et exécuté via after(), jamais sur le chemin de la
 * réponse.
 */

const ISSUE_TO_FEEDBACK_STATUS: Record<string, FeedbackPostStatus> = {
  done: "shipped",
  in_progress: "in_progress",
  in_review: "in_progress",
  canceled: "declined",
};

export function scheduleFeedbackStatusSync(
  issueId: string,
  issueStatus: unknown,
  actorId: string | null = null
): void {
  const mapped =
    typeof issueStatus === "string" ? ISSUE_TO_FEEDBACK_STATUS[issueStatus] : undefined;
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
