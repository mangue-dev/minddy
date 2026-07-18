// Linear CSV export mapper. Columns of interest: ID (ENG-42), Title,
// Description (markdown), Status (state name), Priority (Urgent/High/…),
// Estimate (points), Labels (", "-joined), Created / Completed / Due Date,
// Parent issue (the parent's identifier).

import type { ImportedIssue } from "@/lib/import/types";
import {
  cell,
  mapEffort,
  mapPriority,
  mapStatus,
  MAX_TITLE_LENGTH,
  parseDateValue,
  splitLabels,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";

export function mapLinearRows(table: CsvTable, warnings: Warnings): ImportedIssue[] {
  const issues: ImportedIssue[] = [];

  for (const row of table.rows) {
    const title = cell(table, row, "title").slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    const status = mapStatus(cell(table, row, "status"), warnings);
    const key = cell(table, row, "id");

    issues.push({
      title,
      description: cell(table, row, "description") || null,
      status,
      priority: mapPriority(cell(table, row, "priority")),
      effort: mapEffort(cell(table, row, "estimate")),
      labels: splitLabels(cell(table, row, "labels")),
      dueDate: parseDateValue(cell(table, row, "due date")),
      createdAt: parseDateValue(cell(table, row, "created")),
      completedAt:
        status === "done" ? parseDateValue(cell(table, row, "completed")) : null,
      externalKeys: key ? [key] : [],
      parentExternalKey: cell(table, row, "parent issue") || null,
    });
  }

  return issues;
}
