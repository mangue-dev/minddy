"use client";

import { useMemo, type ComponentProps } from "react";
import { IntegrationIndicator } from "@/components/integration-indicator";
import { PlainPreview } from "@/components/typed-mention-chip";
import { MentionLinksProvider, useMentionLinks } from "@/components/mention-links";
import type { IssueCardFaceSlots } from "@/components/issue-card-face";
import { plainMarkdownParts } from "@/lib/plain-markdown";
import { useIssueResources } from "@/lib/use-issue-resources";
import { resourceLabelLinks } from "@/lib/use-resource-mentions";
import type { IssueCardIssue } from "@/lib/types";

/**
 * The card's two parts that need the app's resolvers: the integration that
 * filed the issue, named from the project's integrations, and the typed
 * mentions of its description (MIN-734), which never print a stored label.
 * The board and the shared board pass them to `IssueCardFace`; a surface
 * without a query client or mention resolver, such as the landing, leaves
 * them out.
 *
 * A description can cite the issue's own attachments (MIN-742), which only
 * the issue's surfaces resolve. With `resolveResources`, a card whose
 * preview holds such a mention reads the issue's resources through the same
 * member-scoped query as the side panel, so the mention reads as the
 * attachment's name rather than as unavailable. The shared board leaves it
 * off: its readers are not members and never see the attachments.
 */
export function useIssueCardRichSlots(
  issue: Pick<IssueCardIssue, "id" | "description" | "integration_id" | "project_id">,
  { resolveResources = false }: { resolveResources?: boolean } = {},
): Pick<IssueCardFaceSlots, "integration" | "description"> {
  // Memoized, and limited to the first 400 characters: three truncated lines
  // need no more, and the rest of the body is never read (MIN-316).
  const description = useMemo(
    () => (issue.description ? plainMarkdownParts(issue.description.slice(0, 400)) : []),
    [issue.description],
  );
  // Only a card that shows an attachment mention asks for the resources:
  // the board does not load every card's attachments.
  const citesResource = resolveResources
    && description.some((part) => typeof part !== "string" && part.type === "resource");
  return {
    integration: <IntegrationIndicator issue={issue} iconClassName="size-3" />,
    // Only typed mentions need the resolver: plain text stays with the face.
    description: description.some((part) => typeof part !== "string") ? (
      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
        {citesResource
          ? <ResourceAwarePreview issueId={issue.id} parts={description} />
          : <PlainPreview parts={description} />}
      </p>
    ) : undefined,
  };
}

/** The preview of a description that cites the issue's attachments. A
    component of its own, so only such a card mounts the resources query. */
function ResourceAwarePreview({
  issueId,
  parts,
}: {
  issueId: string;
  parts: ComponentProps<typeof PlainPreview>["parts"];
}) {
  const { resources } = useIssueResources(issueId);
  const outer = useMentionLinks();
  const links = useMemo(() => resourceLabelLinks(outer, resources), [outer, resources]);
  return (
    <MentionLinksProvider value={links}>
      <PlainPreview parts={parts} />
    </MentionLinksProvider>
  );
}
