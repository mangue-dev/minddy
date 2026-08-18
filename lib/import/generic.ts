// Generic Mapper — documented minddy format, headers accepted in English
// and in French, and the net tools that don't have a map to them (MIN-98):
// un export de tableau Trello ("Card Name", "Card Description", "List Name"),
// the CSV that `gh issue list` writes ("id, title, description, status, labels"), and a
// export from Notion database, whose columns are the properties that
// the user named himself.
//
// These are all the "csv" source: generic CSVs which happen to be
// knows column names, not formats worth mapping.
//
// Notion deserves a word: its headers have NOTHING guaranteed — they are
// properties created by hand, in the workspace language. Aliases
// below cover those of the models provided by Notion (“Task name”,
// “Parent element”, “Due date”…); everything else is precisely the
// work of the template pass, which reads values ​​and not just names.

import type { ColumnAliases } from "@/lib/import/types";
import { GENERIC_TITLE_HEADERS } from "@/lib/import/normalize";

export const GENERIC_COLUMN_ALIASES: ColumnAliases = [
  ["title", GENERIC_TITLE_HEADERS],
  ["description", ["description", "desc", "card description", "body", "notes"]],
  // “list name” is the Trello column, “state” that of GitHub, “status of
  // the stain » that of the French Notion models.
  [
    "status",
    [
      "status",
      "statut",
      "etat",
      "statut de la tache",
      "list name",
      "list",
      "state",
      "colonne",
      "column",
      "etape",
      "stage",
    ],
  ],
  ["priority", ["priority", "priorite", "niveau de priorite", "importance"]],
  [
    "effort",
    [
      "effort",
      "estimate",
      "estimation",
      "points",
      "story points",
      "effort level",
      "niveau deffort",
      "taille",
      "size",
      "complexite",
    ],
  ],
  [
    "labels",
    ["labels", "etiquettes", "tags", "categories", "mots cles", "keywords"],
  ],
  [
    "assignee",
    [
      "assignee",
      "assigne",
      "assignee a",
      "responsable",
      "owner",
      "proprietaire",
      "attribue a",
      "affecte a",
      "member",
      "membre",
      "personne",
      "qui",
    ],
  ],
  [
    "dueDate",
    [
      "due date",
      "due",
      "echeance",
      "deadline",
      "date decheance",
      "date limite",
      "date de fin",
    ],
  ],
  [
    "createdAt",
    [
      "created",
      "creation",
      "cree le",
      "created at",
      "date created",
      "created time",
      "date de creation",
    ],
  ],
  [
    "completedAt",
    [
      "closed at",
      "completed at",
      "resolved at",
      "completed on",
      "completed",
      "termine le",
      "date de fin reelle",
    ],
  ],
  ["externalKey", ["id", "key", "cle", "ref", "card id", "number", "identifiant"]],
  // Notion references its parent by TITLE, not by identifier: `applyMapping`
  // knows this and takes the title as the key when the file has no id column.
  [
    "parent",
    ["parent", "parent item", "element parent", "parent task", "tache parente"],
  ],
];
