// A minddy export reread by minddy — the alias table of OUR own format.
//
// It has no other source of truth than `lib/export/issues-csv.ts`: the
// headers below are the ones that the export writes, and the round trip test
// (`lib/import/import.test.ts`) checks it column by column. A file
// exported from one project therefore fits completely into another — that's what makes it
// export a real move and not just a data output.
//
// Two columns are written and NEVER reread, hence their explicit `ignore`:
// “Project” and “Objective” name a context of the START project, which
// does not necessarily exist on arrival. Mark them here rather than leaving them
// falling to default changes one thing: `mappingHasGaps` knows that they are a
// choice and not an oversight, so the model pass does not have to be paid for
// “place” two columns that we decided not to import.

import type { ColumnAliases } from "@/lib/import/types";

export const MINDDY_COLUMN_ALIASES: ColumnAliases = [
  ["title", ["title"]],
  ["description", ["description"]],
  ["status", ["status"]],
  ["priority", ["priority"]],
  ["effort", ["effort"]],
  ["labels", ["labels"]],
  ["assignee", ["assignee"]],
  ["dueDate", ["due date"]],
  ["createdAt", ["created"]],
  ["completedAt", ["completed"]],
  ["externalKey", ["id"]],
  ["parent", ["parent"]],
  ["ignore", ["project", "objective"]],
];
