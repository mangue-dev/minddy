// Generic CSV mapper — the documented minddy format, headers accepted in
// English and French. Only a title column is required; everything else is
// optional: description, status/statut, priority/priorité, effort (t-shirt or
// points), labels/étiquettes (comma- or semicolon-separated), due date/
// échéance, created, id/key/réf and parent for sub-issues.
//
// It is also what catches the tools without a mapper of their own (MIN-98):
// a Trello board export ("Card Name", "Card Description", "List Name") and the
// CSV a `gh issue list` command writes ("id,title,description,status,labels").
// Both stay source "csv" — they are generic CSVs whose column names we happen
// to know, not a format worth a dedicated mapper.

import type { ImportedIssue } from "@/lib/import/types";
import {
  cell,
  GENERIC_TITLE_HEADERS,
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
    const title = cell(table, row, ...GENERIC_TITLE_HEADERS).slice(
      0,
      MAX_TITLE_LENGTH
    );
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    // "list name" is Trello's column, "state" GitHub's — an unknown list name
    // falls back to backlog with a warning, which is the honest outcome for a
    // board whose columns don't map onto minddy's statuses.
    const status = mapStatus(
      cell(table, row, "status", "statut", "etat", "list name", "list", "state"),
      warnings
    );
    const key = cell(table, row, "id", "key", "cle", "ref", "card id", "number");

    issues.push({
      title,
      description:
        cell(table, row, "description", "desc", "card description", "body") || null,
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
      createdAt: parseDateValue(
        cell(table, row, "created", "creation", "cree le", "created at", "date created")
      ),
      // Only read back for `done` issues on insert (lib/server/import-issues.ts),
      // so a closing date on a still-open row is harmless.
      completedAt: parseDateValue(
        cell(table, row, "closed at", "completed at", "resolved at")
      ),
      externalKeys: key ? [key] : [],
      parentExternalKey: cell(table, row, "parent") || null,
    });
  }

  return issues;
}
