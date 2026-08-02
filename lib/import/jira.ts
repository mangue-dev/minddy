// Jira CSV export — table d'alias, plus les deux singularités du format.
//
// 1. Les champs multi-valués sortent en colonnes RÉPÉTÉES ("Labels", "Labels",
//    …). Rien à faire ici : un plan assigne les colonnes par index, donc les
//    trois « Labels » visent le même champ et `applyMapping` les concatène.
// 2. Une ligne répond À LA FOIS à sa clé (PROJ-12) et à son id numérique, parce
//    que « Parent » référence l'une ou l'autre selon la version de Jira — d'où
//    deux colonnes `externalKey`.
//
// Les points d'histoire vivent dans un champ maison dont l'en-tête exact varie
// (« Custom field (Story Points) », « Story point estimate », …) : impossible à
// aliaser, on le cherche.

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

/** Le nom normalisé de la colonne de points, s'il y en a une. */
export function jiraStoryPointsHeader(table: CsvTable): string | null {
  for (const name of table.headerIndex.keys()) {
    if (name.includes("story point")) return name;
  }
  return null;
}
