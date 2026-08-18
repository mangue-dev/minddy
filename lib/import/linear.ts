// Linear CSV export — the alias table of its columns. Useful columns:
// ID (ENG-42), Title, Description (markdown), Status (status name), Priority
// (Urgent/High/…), Estimate (points), Labels (joints par ", "), Created /
// Completed / Due Date, Parent issue (l'identifiant du parent).
//
// “Assignee” has the display name Linear: brought closer to the members of the
// arrival project (`lib/import/people.ts`), he returns the ticket to his
// owner when it is the same person on both sides.
//
// What else the file carries (Team, Creator, Cycle, Project, Milestone)
// has no field in minddy: these columns remain unassigned, and that's
// the pass of the model which decides to recover them in categories or in note of
// description (`lib/server/import-mapping-ai.ts`).

import type { ColumnAliases } from "@/lib/import/types";

export const LINEAR_COLUMN_ALIASES: ColumnAliases = [
  ["title", ["title"]],
  ["description", ["description"]],
  ["status", ["status"]],
  ["priority", ["priority"]],
  ["effort", ["estimate"]],
  ["labels", ["labels"]],
  ["assignee", ["assignee"]],
  ["dueDate", ["due date"]],
  ["createdAt", ["created"]],
  ["completedAt", ["completed"]],
  ["externalKey", ["id"]],
  // “Parent” for short is not a Linear header, but a file read like
  // such without being one often carries it: recognizing it costs nothing and
  // avoid losing the entire hierarchy on a slightly broad detection.
  ["parent", ["parent issue", "parent"]],
];
