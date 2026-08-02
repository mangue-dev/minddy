// Linear CSV export — la table d'alias de ses colonnes. Colonnes utiles :
// ID (ENG-42), Title, Description (markdown), Status (nom d'état), Priority
// (Urgent/High/…), Estimate (points), Labels (joints par ", "), Created /
// Completed / Due Date, Parent issue (l'identifiant du parent).
//
// « Assignee » porte le nom d'affichage Linear : rapproché des membres du
// projet d'arrivée (`lib/import/people.ts`), il rend le ticket à son
// propriétaire quand c'est la même personne des deux côtés.
//
// Ce que le fichier porte d'autre (Team, Creator, Cycle, Project, Milestone)
// n'a pas de champ dans minddy : ces colonnes restent non assignées, et c'est
// la passe du modèle qui décide de les récupérer en catégories ou en note de
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
  // « Parent » tout court n'est pas un en-tête Linear, mais un fichier lu comme
  // tel sans en être un le porte souvent : le reconnaître ne coûte rien et
  // évite de perdre toute la hiérarchie sur une détection un peu large.
  ["parent", ["parent issue", "parent"]],
];
