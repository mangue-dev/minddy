import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import type { AgentRun } from "./runs";

/**
 * Aligne le statut de l'issue sur l'état de la PR de l'agent de code (MIN-46) :
 *  - PR ouverte / draft → `in_review`
 *  - PR mergée          → `done`
 *  - PR fermée (refusée) → `canceled`
 *
 * Appelé à l'ouverture de la PR (execute.ts), sur les actions de review in-app
 * (merge/close) et sur le webhook GitHub (merge/close/reopen). Best-effort : la
 * synchro ne doit jamais faire échouer le flux appelant.
 */

type SyncableIssueStatus = "in_review" | "done" | "canceled";

/** pr_state → statut d'issue à appliquer, ou null si l'état n'implique rien. */
export function issueStatusForPrState(
  prState: AgentRun["pr_state"],
): SyncableIssueStatus | null {
  switch (prState) {
    case "open":
    case "draft":
      return "in_review";
    case "merged":
      return "done";
    case "closed":
      return "canceled";
    default:
      return null;
  }
}

export async function syncIssueStatusFromPr(opts: {
  issueId: string;
  /** Acteur du changement (auteur du run pour l'agent/webhook, user pour merge/close in-app). */
  actorId: string;
  prState: AgentRun["pr_state"];
}): Promise<void> {
  const status = issueStatusForPrState(opts.prState);
  if (!status) return;
  try {
    const result = await updateIssueFields({
      issueId: opts.issueId,
      actorId: opts.actorId,
      input: { status },
      viaAssistant: true,
    });
    if (!result.ok) {
      console.error(
        "[agent] issue status sync skipped:",
        result.errorKey ?? result.rawMessage ?? result.status,
      );
    }
  } catch (err) {
    console.error("[agent] issue status sync failed:", (err as Error).message);
  }
}
