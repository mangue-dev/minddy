"use client";

import { IntegrationIndicator } from "@/components/integration-indicator";
import type { IssueCardFaceSlots } from "@/components/issue-card-face";
import type { IssueCardIssue } from "@/lib/types";

/**
 * The card's part that needs the app's resolvers: the integration that filed
 * the issue, named from the project's integrations. The board and the shared
 * board pass it to `IssueCardFace`; a surface without a query client, such as
 * the landing, leaves it out.
 */
export function useIssueCardRichSlots(
  issue: Pick<IssueCardIssue, "id" | "integration_id" | "project_id">,
): Pick<IssueCardFaceSlots, "integration"> {
  return {
    integration: <IntegrationIndicator issue={issue} iconClassName="size-3" />,
  };
}
