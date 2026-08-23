import "server-only";

import { mapIssueRow } from "@/lib/server/issue-mapper";

type IssueRow = Parameters<typeof mapIssueRow>[0];
type AttachmentIssueRow = { issue_id: string | null };

/** Add the project-level attachment aggregate without issuing per-issue reads. */
export function buildProjectIssueResponse(
  rows: IssueRow[],
  attachmentRows: AttachmentIssueRow[],
) {
  const resourceCounts = new Map<string, number>();
  for (const row of attachmentRows) {
    if (!row.issue_id) continue;
    resourceCounts.set(row.issue_id, (resourceCounts.get(row.issue_id) ?? 0) + 1);
  }

  return rows.map((row) => {
    const mapped = mapIssueRow(row);
    const issueId = row.id as string;
    return { ...mapped, resource_count: resourceCounts.get(issueId) ?? 0 };
  });
}
