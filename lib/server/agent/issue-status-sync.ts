import "server-only";

import { updateIssueFields } from "@/lib/server/update-issue";
import {
  issueStatusForPrState,
  type SyncableIssueStatus,
} from "@/lib/pr-issue-status";
import type { RepoProviderId } from "@/lib/repo-providers";
import type { AgentRun } from "./runs";

/**
 * Aligne le statut de l'issue sur le cycle de vie de l'agent de code (MIN-46) :
 *  - agent lancé, aucune PR encore disponible → `in_progress`
 *  - PR BROUILLON (pas encore proposée)        → `in_progress`
 *  - PR ouverte (disponible en revue)          → `in_review`
 *  - PR mergée (acceptée)                       → `done`
 *  - PR fermée (refusée)                        → `todo` (retour à faire, PAS annulée)
 *
 * `syncIssueStatusOnAgentStart` est appelé au démarrage / à la reprise sans PR
 * (launch.ts). `syncIssueStatusFromPr` est appelé à l'ouverture de la PR
 * (execute.ts), sur les actions de review in-app (merge/close) et sur le webhook
 * GitHub (merge/close/reopen). Best-effort : la synchro ne doit jamais faire
 * échouer le flux appelant.
 */

// La TABLE, elle, vit en pur dans `lib/pr-issue-status` : le dialog qui lie un
// ticket à une PR à la main (MIN-163) l'annonce avant de faire le geste, et un
// module `server-only` ne se lit pas depuis le navigateur. Ré-exportée ici, où
// tous ses appelants serveur la cherchent déjà.
export { issueStatusForPrState } from "@/lib/pr-issue-status";

/**
 * Écrit le statut sur l'issue (best-effort, via Numo). Point de passage unique.
 *
 * `forgeSync` bascule l'attribution : l'écriture porte toujours techniquement un
 * membre (elle traverse le garde d'accès de `updateIssueFields`), mais la
 * timeline crédite la FORGE. C'est la convention de MIN-97, reprise ici pour les
 * PR sans run — personne dans minddy n'a fait ce geste (MIN-143).
 */
async function applyIssueStatus(
  issueId: string,
  actorId: string,
  status: SyncableIssueStatus,
  forgeSync: RepoProviderId | null = null,
): Promise<void> {
  try {
    const result = await updateIssueFields({
      issueId,
      actorId,
      input: { status },
      // Une PR humaine ne passe pas par Numo : le crédit va à la forge, pas à lui.
      viaAssistant: !forgeSync,
      forgeSync,
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
  /** Forge à créditer à la place de l'acteur — une PR sans run (MIN-143). */
  forgeSync?: RepoProviderId | null;
}): Promise<void> {
  const status = issueStatusForPrState(opts.prState);
  if (!status) return;
  await applyIssueStatus(opts.issueId, opts.actorId, status, opts.forgeSync ?? null);
}
