// Mapper générique — le format minddy documenté, en-têtes acceptés en anglais
// et en français, et le filet des outils qui n'ont pas de mapper à eux (MIN-98) :
// un export de tableau Trello ("Card Name", "Card Description", "List Name"),
// le CSV qu'écrit `gh issue list` ("id,title,description,status,labels"), et un
// export de base de données Notion, dont les colonnes sont les propriétés que
// l'utilisateur a nommées lui-même.
//
// Ce sont tous la source "csv" : des CSV génériques dont il se trouve qu'on
// connaît les noms de colonnes, pas des formats qui méritent un mapper.
//
// Notion mérite un mot : ses en-têtes n'ont RIEN de garanti — ce sont des
// propriétés créées à la main, dans la langue de l'espace de travail. Les alias
// ci-dessous couvrent celles des modèles fournis par Notion (« Task name »,
// « Élément parent », « Date d'échéance »…) ; tout le reste est précisément le
// travail de la passe du modèle, qui lit les valeurs et pas seulement les noms.

import type { ColumnAliases } from "@/lib/import/types";
import { GENERIC_TITLE_HEADERS } from "@/lib/import/normalize";

export const GENERIC_COLUMN_ALIASES: ColumnAliases = [
  ["title", GENERIC_TITLE_HEADERS],
  ["description", ["description", "desc", "card description", "body", "notes"]],
  // « list name » est la colonne Trello, « state » celle de GitHub, « statut de
  // la tache » celle des modèles Notion français.
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
  // Notion référence son parent par TITRE, pas par identifiant : `applyMapping`
  // le sait et prend le titre pour clé quand le fichier n'a pas de colonne d'id.
  [
    "parent",
    ["parent", "parent item", "element parent", "parent task", "tache parente"],
  ],
];
