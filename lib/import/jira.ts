// Jira CSV export mapper. Multi-value fields come as REPEATED columns
// ("Labels", "Labels", …) — handled by cells(). Rows answer to both their
// issue key (PROJ-12) and numeric issue id, because "Parent" references
// either depending on the Jira version. Story points live in a custom-field
// column whose exact header varies ("Custom field (Story Points)", …).

import type { ImportedIssue } from "@/lib/import/types";
import {
  cell,
  cells,
  effortFromPoints,
  mapPriority,
  mapStatus,
  MAX_TITLE_LENGTH,
  normalizeToken,
  parseDateValue,
  splitLabels,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";

/** Resolutions that turn a "Done"-looking status into canceled / duplicate. */
const RESOLUTION_OVERRIDES: Record<string, "canceled" | "duplicate"> = {
  "wont do": "canceled",
  "wont fix": "canceled",
  declined: "canceled",
  "cannot reproduce": "canceled",
  duplicate: "duplicate",
};

export function mapJiraRows(table: CsvTable, warnings: Warnings): ImportedIssue[] {
  // Locate the story-points column once — any header mentioning "story points".
  let storyPointsHeader: string | null = null;
  for (const name of table.headerIndex.keys()) {
    if (name.includes("story points")) {
      storyPointsHeader = name;
      break;
    }
  }

  const issues: ImportedIssue[] = [];

  for (const row of table.rows) {
    const title = cell(table, row, "summary").slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    let status = mapStatus(cell(table, row, "status"), warnings);
    const resolution = RESOLUTION_OVERRIDES[normalizeToken(cell(table, row, "resolution"))];
    if (status === "done" && resolution) status = resolution;

    // Labels: repeated columns (one value each) and/or a joined single column.
    const labels = [
      ...new Set(cells(table, row, "labels").flatMap(splitLabels)),
    ];

    const externalKeys = [
      cell(table, row, "issue key"),
      cell(table, row, "issue id"),
    ].filter(Boolean);

    issues.push({
      title,
      description: cell(table, row, "description") || null,
      status,
      priority: mapPriority(cell(table, row, "priority")),
      effort: storyPointsHeader
        ? effortFromPoints(cell(table, row, storyPointsHeader))
        : null,
      labels,
      dueDate: parseDateValue(cell(table, row, "due date")),
      createdAt: parseDateValue(cell(table, row, "created")),
      completedAt:
        status === "done" ? parseDateValue(cell(table, row, "resolved")) : null,
      externalKeys,
      parentExternalKey:
        cell(table, row, "parent key", "parent", "parent id") || null,
    });
  }

  return issues;
}
