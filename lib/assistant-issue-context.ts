import type { AssistantPageContext } from "@/lib/assistant-types";
import type { Issue } from "@/lib/types";

/**
 * Le contexte Numo d'une poignée de tickets : la sélection d'un board, ou la
 * carte survolée quand « @ » l'a désignée (MIN-105).
 *
 * Un ticket unique emprunte les champs SINGULIERS plutôt que les listes : la
 * pilule affiche alors « KEY-42 — son titre » au lieu de « 1 ticket
 * sélectionné » (components/assistant/page-context-badge.tsx), et le prompt
 * serveur prend sa branche « ce ticket », plus directe que la branche
 * « sélection » (lib/server/assistant/prompt.ts).
 *
 * @param identifierOf Rend l'identifiant lisible du ticket ("KEY-42") — la clé
 *   du projet vit sur le board, pas sur l'issue.
 */
export function issuesPageContext(
  issues: Issue[],
  identifierOf: (issue: Issue) => string
): AssistantPageContext {
  if (issues.length === 1) {
    const [issue] = issues;
    return {
      issueId: issue.id,
      issueIdentifier: identifierOf(issue),
      issueTitle: issue.title,
    };
  }
  return {
    issueIds: issues.map((issue) => issue.id),
    issueIdentifiers: issues.map(identifierOf),
    issueTitles: issues.map((issue) => issue.title),
  };
}
