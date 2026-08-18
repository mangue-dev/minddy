import type { AssistantPageContext } from "@/lib/assistant-types";
import type { Issue } from "@/lib/types";

/**
 * The Numo context of a handful of tickets: the selection of a board, or the
 * card hovered over when "@" has designated it (MIN-105).
 *
 * A single ticket uses SINGULAR fields rather than lists: the
 * pill displays then "KEY-42 — its title" instead of "1 ticket
 * selected" (components/assistant/page-context-badge.tsx), and the prompt
 * server takes its branch "this ticket", more direct than the branch
 * "selection" (lib/server/assistant/prompt.ts).
 *
 * @param identifierOf Makes the readable identifier of the ticket ("KEY-42") — the key
 * of the project lives on the board, not on the issue.
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
