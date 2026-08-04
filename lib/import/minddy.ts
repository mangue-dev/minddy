// Un export minddy relu par minddy — la table d'alias de NOTRE propre format.
//
// Elle n'a pas d'autre source de vérité que `lib/export/issues-csv.ts` : les
// en-têtes ci-dessous sont ceux que l'export écrit, et le test d'aller-retour
// (`lib/import/import.test.ts`) le vérifie colonne par colonne. Un fichier
// exporté d'un projet rentre donc entier dans un autre — c'est ce qui fait de
// l'export un vrai déménagement et pas seulement une sortie de données.
//
// Deux colonnes sont écrites et JAMAIS relues, d'où leur `ignore` explicite :
// « Project » et « Objective » nomment un contexte du projet de DÉPART, qui
// n'existe pas forcément à l'arrivée. Les marquer ici plutôt que de les laisser
// tomber par défaut change une chose : `mappingHasGaps` sait qu'elles sont un
// choix et pas un oubli, donc la passe du modèle n'a pas à être payée pour
// « placer » deux colonnes qu'on a décidé de ne pas importer.

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
