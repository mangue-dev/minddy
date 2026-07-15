import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import type { AgentRun } from "./runs";

/**
 * Aligne le statut de l'issue sur le cycle de vie de l'agent de code (MIN-46) :
 *  - agent lancé, aucune PR encore disponible → `in_progress`
 *  - PR ouverte / draft (disponible en revue)  → `in_review`
 *  - PR mergée (acceptée)                       → `done`
 *  - PR fermée (refusée)                        → `todo` (retour à faire, PAS annulée)
 *
 * `syncIssueStatusOnAgentStart` est appelé au démarrage / à la reprise sans PR
 * (launch.ts). `syncIssueStatusFromPr` est appelé à l'ouverture de la PR
 * (execute.ts), sur les actions de review in-app (merge/close) et sur le webhook
 * GitHub (merge/close/reopen). Best-effort : la synchro ne doit jamais faire
 * échouer le flux appelant.
 */

type SyncableIssueStatus = "in_progress" | "in_review" | "done" | "todo";

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
      // PR refusée → l'issue retourne « à faire » (jamais annulée) : le travail
      // reste à reprendre, contrairement à un abandon explicite (MIN-46).
      return "todo";
    default:
      return null;
  }
}

/** Écrit le statut sur l'issue (best-effort, via Numo). Point de passage unique. */
async function applyIssueStatus(
  issueId: string,
  actorId: string,
  status: SyncableIssueStatus,
): Promise<void> {
  try {
    const result = await updateIssueFields({
      issueId,
      actorId,
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

/**
 * L'agent démarre (ou reprend) le travail sans PR disponible → l'issue passe en
 * `in_progress`. Appelé au lancement d'un run et à la reprise d'une session qui
 * n'a pas (ou plus) de PR ouverte.
 */
export async function syncIssueStatusOnAgentStart(opts: {
  issueId: string;
  actorId: string;
}): Promise<void> {
  await applyIssueStatus(opts.issueId, opts.actorId, "in_progress");
}

export async function syncIssueStatusFromPr(opts: {
  issueId: string;
  /** Acteur du changement (auteur du run pour l'agent/webhook, user pour merge/close in-app). */
  actorId: string;
  prState: AgentRun["pr_state"];
}): Promise<void> {
  const status = issueStatusForPrState(opts.prState);
  if (!status) return;
  await applyIssueStatus(opts.issueId, opts.actorId, status);
}
