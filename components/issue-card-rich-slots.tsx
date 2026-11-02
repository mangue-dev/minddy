"use client";

import { useMemo } from "react";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { PlainPreview } from "@/components/typed-mention-chip";
import type { IssueCardFaceSlots } from "@/components/issue-card-face";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import type { IssueCardIssue } from "@/lib/types";

/**
 * The card's two parts that need the app's resolvers: the integration that
 * filed the issue, named from the project's integrations, and the typed
 * mentions of its description (MIN-734), which never print a stored label.
 * The board and the shared board pass them to `IssueCardFace`; a surface
 * without a query client or mention resolver, such as the landing, leaves
 * them out.
 */
export function useIssueCardRichSlots(
  issue: Pick<IssueCardIssue, "description" | "integration_id" | "project_id">,
): Pick<IssueCardFaceSlots, "integration" | "description"> {
  // Memoized, and limited to the first 400 characters: three truncated lines
  // need no more, and the rest of the body is never read (MIN-316).
  const description = useMemo(
    () => (issue.description ? plainMarkdownParts(issue.description.slice(0, 400)) : []),
    [issue.description],
  );
  return {
    integration: <IntegrationIndicator issue={issue} iconClassName="size-3" />,
    // Only typed mentions need the resolver: plain text stays with the face.
    description: description.some((part) => typeof part !== "string") ? (
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        <PlainPreview parts={description} />
      </p>
    ) : undefined,
  };
}
