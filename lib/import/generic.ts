// Generic CSV mapper — the documented minddy format, headers accepted in
// English and French. Only a title column is required; everything else is
// optional: description, status/statut, priority/priorité, effort (t-shirt or
// points), labels/étiquettes (comma- or semicolon-separated), due date/
// échéance, created, id/key/réf and parent for sub-issues.

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

export function mapGenericRows(table: CsvTable, warnings: Warnings): ImportedIssue[] {
  const issues: ImportedIssue[] = [];

  for (const row of table.rows) {
    const title = cell(table, row, "title", "titre", "summary", "name", "nom").slice(
      0,
      MAX_TITLE_LENGTH
    );
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    const status = mapStatus(
      cell(table, row, "status", "statut", "etat"),
      warnings
    );
    const key = cell(table, row, "id", "key", "cle", "ref");

    issues.push({
      title,
      description: cell(table, row, "description", "desc") || null,
      status,
      priority: mapPriority(cell(table, row, "priority", "priorite")),
      effort: mapEffort(
        cell(table, row, "effort", "estimate", "estimation", "points")
      ),
      labels: splitLabels(
        cell(table, row, "labels", "etiquettes", "tags", "categories")
      ),
      dueDate: parseDateValue(
        cell(table, row, "due date", "due", "echeance", "deadline")
      ),
      createdAt: parseDateValue(cell(table, row, "created", "creation", "cree le")),
      completedAt: null,
      externalKeys: key ? [key] : [],
      parentExternalKey: cell(table, row, "parent") || null,
    });
  }

  return issues;
}
