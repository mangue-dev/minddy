// Jira CSV export — alias table, plus the two format singularities.
//
// 1. Multi-valued fields output in REPEATED columns ("Labels", "Labels",
// …). Nothing to do here: a plan assigns the columns by index, therefore the
// three “Labels” target the same field and `applyMapping` concatenates them.
// 2. A line responds to BOTH its key (PROJ-12) and its numeric id, because
// that “Parent” references one or the other depending on the Jira version — hence
//    deux colonnes `externalKey`.
//
// Story points live in a house field whose exact header varies
// (“Custom field (Story Points)”, “Story point estimate”, …): impossible to
// alias, we are looking for it.

import type { ColumnAliases } from "@/lib/import/types";
import type { CsvTable } from "@/lib/import/normalize";

export const JIRA_COLUMN_ALIASES: ColumnAliases = [
  ["title", ["summary"]],
  ["description", ["description"]],
  ["status", ["status"]],
  ["priority", ["priority"]],
  ["resolution", ["resolution"]],
  ["labels", ["labels"]],
  ["assignee", ["assignee"]],
  ["dueDate", ["due date"]],
  ["createdAt", ["created"]],
  ["completedAt", ["resolved"]],
  ["externalKey", ["issue key", "issue id"]],
  ["parent", ["parent key", "parent", "parent id"]],
];

/** The standardized name of the points column, if there is one. */
export function jiraStoryPointsHeader(table: CsvTable): string | null {
  for (const name of table.headerIndex.keys()) {
    if (name.includes("story point")) return name;
  }
  return null;
}
