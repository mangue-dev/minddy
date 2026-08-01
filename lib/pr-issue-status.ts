import type { IssueStatus } from "./issue-constants";

/**
 * La table qui dit ce qu'un état de pull request implique pour son ticket
 * (MIN-46). Pure et sans dépendance serveur : la synchro l'applique
 * (`lib/server/agent/issue-status-sync`), et le dialog qui lie un ticket à une
 * PR à la main (MIN-163) l'ANNONCE avant de faire le geste — la conséquence se
 * dit avant, pas après, puisque la liaison ne s'annule pas.
 *
 * Une seule copie de la règle : la dupliquer côté client la laisserait diverger
 * en silence, et l'utilisateur lirait alors une promesse que le serveur ne tient
 * pas.
 */

/** Les seuls statuts qu'une pull request fait bouger. */
export type SyncableIssueStatus = Extract<
  IssueStatus,
  "in_progress" | "in_review" | "done" | "todo"
>;

/** pr_state → statut d'issue à appliquer, ou null si l'état n'implique rien. */
export function issueStatusForPrState(
  prState: "draft" | "open" | "merged" | "closed" | null | undefined,
): SyncableIssueStatus | null {
  switch (prState) {
    case "open":
      return "in_review";
    case "draft":
      // Une PR brouillon n'est PAS prête à être relue : son auteur la travaille
      // encore. La pousser en revue ferait apparaître dans la file de relecture
      // un travail que personne n'a proposé (MIN-138).
      return "in_progress";
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
