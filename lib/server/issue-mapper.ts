import "server-only";

/** Select string that embeds the N–N category links alongside the issue row. */
export const ISSUE_SELECT = "*, issue_categories(category_id)";

type IssueRow = Record<string, unknown> & {
  issue_categories?: { category_id: string }[] | null;
};

/** Flatten the embedded issue_categories into a `category_ids: string[]` field. */
export function mapIssueRow(row: IssueRow) {
  const { issue_categories, ...rest } = row;
  return {
    ...rest,
    category_ids: (issue_categories ?? []).map((c) => c.category_id),
  };
}
