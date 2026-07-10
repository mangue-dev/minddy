import "server-only";

import { after } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import type { FeedbackPostStatus } from "@/lib/feedback/types";

/**
 * Reflet du statut d'une issue liée sur son post de feedback (MIN-37).
 * Mapping volontairement minimal : done→shipped, in_progress→in_progress ;
 * toute autre transition d'issue est un no-op (le post garde sa valeur, posée
 * manuellement par l'équipe : planned, declined…). Branché dans
 * updateIssueFields — le chokepoint de tous les chemins de mutation — et
 * exécuté via after(), jamais sur le chemin de la réponse.
 */

const ISSUE_TO_FEEDBACK_STATUS: Record<string, FeedbackPostStatus> = {
  done: "shipped",
  in_progress: "in_progress",
};

export function scheduleFeedbackStatusSync(issueId: string, issueStatus: unknown): void {
  const mapped =
    typeof issueStatus === "string" ? ISSUE_TO_FEEDBACK_STATUS[issueStatus] : undefined;
  if (!mapped) return;
  after(() =>
    syncFeedbackStatusForIssue(issueId, mapped).catch((e) =>
      console.error("[feedback-status-sync] failed:", (e as Error).message)
    )
  );
}

export async function syncFeedbackStatusForIssue(
  issueId: string,
  status: FeedbackPostStatus
): Promise<void> {
  const service = getServiceClient();
  const { error } = await service
    .from("feedback_posts")
    .update({ status })
    .eq("issue_id", issueId);
  if (error) {
    console.error("[feedback-status-sync] update failed:", error.message);
  }
}
