// Le mapper de lignes — le SEUL. Linear, Jira, Trello, Notion, un CSV maison :
// tous arrivent ici sous la même forme, un `ImportMapping` qui dit où va chaque
// colonne et à quoi se ramène chaque valeur. Ce qui distingue une source d'une
// autre vit entièrement dans la construction du plan (`lib/import/mapping.ts`),
// jamais dans la lecture des lignes.
//
// Corollaire : ce que le tableau de correspondance de l'aperçu modifie, ce sont
// les mêmes leviers que ceux de la détection automatique. Il n'y a pas un
// chemin « détecté » et un chemin « corrigé à la main » — un seul, deux façons
// d'écrire le plan.

import type { IssueEffortValue, IssueStatusValue } from "@/lib/issue-validation";
import type { ImportedIssue, ImportField, ImportMapping } from "@/lib/import/types";
import {
  cell,
  cells,
  effortFromPoints,
  MAX_TITLE_LENGTH,
  normalizeToken,
  parseDateValue,
  splitLabels,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";

/** Résolutions Jira qui requalifient un statut « Done » (colonne `resolution`). */
const RESOLUTION_OVERRIDES: Record<string, "canceled" | "duplicate"> = {
  "wont do": "canceled",
  "wont fix": "canceled",
  wontfix: "canceled",
  declined: "canceled",
  "cannot reproduce": "canceled",
  "cant reproduce": "canceled",
  duplicate: "duplicate",
};

/** Ce qu'une colonne reportée en note ajoute au bas de la description. */
const NOTE_SEPARATOR = "\n\n---\n";

export function applyMapping(
  table: CsvTable,
  mapping: ImportMapping,
  warnings: Warnings
): ImportedIssue[] {
  const at = (field: ImportField) =>
    mapping.columns.flatMap((f, i) => (f === field ? [i] : []));

  const cols = {
    title: at("title"),
    description: at("description"),
    status: at("status"),
    priority: at("priority"),
    effort: at("effort"),
    labels: at("labels"),
    assignee: at("assignee"),
    dueDate: at("dueDate"),
    createdAt: at("createdAt"),
    completedAt: at("completedAt"),
    externalKey: at("externalKey"),
    parent: at("parent"),
    resolution: at("resolution"),
    extraLabels: at("extraLabels"),
    extraNote: at("extraNote"),
  };
  /** L'en-tête sous lequel reporter un assigné qu'on n'a pas su reconnaître. */
  const assigneeHeader = cols.assignee.map((i) => table.headers[i])[0] ?? "";

  const issues: ImportedIssue[] = [];

  for (const row of table.rows) {
    const title = cell(row, cols.title).slice(0, MAX_TITLE_LENGTH);
    if (!title) {
      warnings.add("skippedNoTitle");
      continue;
    }

    // ── Statut : le dictionnaire du plan fait foi. Une valeur qu'il ne porte
    // pas est une valeur que personne (alias, modèle, utilisateur) n'a su
    // placer : backlog, et on le dit. ──
    const rawStatus = cell(row, cols.status);
    let status: IssueStatusValue = "backlog";
    if (rawStatus) {
      const mapped = mapping.statusValues[normalizeToken(rawStatus)];
      if (mapped) status = mapped;
      else warnings.add("unknownStatus", rawStatus);
    }

    const resolution = RESOLUTION_OVERRIDES[normalizeToken(cell(row, cols.resolution))];
    if (status === "done" && resolution) status = resolution;

    const rawPriority = normalizeToken(cell(row, cols.priority));
    const priority = mapping.priorityValues[rawPriority] ?? "none";

    // Effort : jeton connu du plan (xs…xl, « Small », « Moyen »), sinon points.
    const rawEffort = cell(row, cols.effort);
    const effort: IssueEffortValue | null = rawEffort
      ? (mapping.effortValues[normalizeToken(rawEffort)] ?? effortFromPoints(rawEffort))
      : null;

    // Étiquettes : les colonnes de labels, plus les colonnes orphelines qu'on a
    // choisi de transformer en catégories. Chacune passe par le dictionnaire,
    // qui la ramène sur une catégorie EXISTANTE du projet quand il y en a une —
    // c'est ce qui évite de créer « Bugs » à côté du « Bug » déjà là. Une
    // entrée vide écarte l'étiquette. Dédoublonnage après rapprochement : deux
    // étiquettes du fichier peuvent viser la même catégorie.
    const labels: string[] = [];
    const seenLabels = new Set<string>();
    for (const value of [
      ...cells(row, cols.labels),
      ...cells(row, cols.extraLabels),
    ]) {
      for (const label of splitLabels(value)) {
        const mapped = mapping.labelValues[normalizeToken(label)];
        const name = mapped === undefined ? label : mapped;
        if (!name) continue;
        const key = name.toLowerCase();
        if (seenLabels.has(key)) continue;
        seenLabels.add(key);
        labels.push(name);
      }
    }

    // ── Assigné : le fichier nomme quelqu'un, le projet a des membres. ──
    // Reconnu, le ticket lui revient. Pas reconnu, il reste non assigné mais le
    // nom descend dans la description : on n'efface pas une information faute
    // de savoir où la ranger.
    let assigneeId: string | null = null;
    const rawAssignee = cell(row, cols.assignee);
    if (rawAssignee) {
      assigneeId = mapping.assigneeValues[normalizeToken(rawAssignee)] ?? null;
      if (!assigneeId) warnings.add("unknownAssignee", rawAssignee);
    }

    // Colonnes sans champ dans minddy, reportées en bas de la description :
    // « En-tête : valeur », une par ligne. Le libellé est celui du fichier —
    // c'est la donnée de l'utilisateur, elle ne se traduit pas.
    const notes = cols.extraNote
      .map((i) => {
        const value = (row[i] ?? "").trim();
        return value ? `${table.headers[i]} : ${value}` : "";
      })
      .filter(Boolean);
    // Une personne qu'aucun membre ne recouvre finit là — perdre le nom serait
    // pire que de le ranger dans la description.
    if (rawAssignee && !assigneeId) {
      notes.push(`${assigneeHeader || "Assignee"} : ${rawAssignee}`);
    }

    // Le trait de séparation ne sépare que s'il y a quelque chose au-dessus :
    // une ligne sans description commence directement par ses notes.
    const body = cell(row, cols.description);
    const description =
      notes.length === 0
        ? body
        : body
          ? `${body}${NOTE_SEPARATOR}${notes.join("\n")}`
          : notes.join("\n");

    // Sans colonne d'identifiant, le titre EN TIENT LIEU : c'est comme ça qu'un
    // export Notion relie ses sous-tâches, sa colonne « Élément parent » portant
    // le titre du parent et non une clé. Quand le fichier a de vrais
    // identifiants, on n'y touche pas — deux tickets homonymes se confondraient.
    const keys = cells(row, cols.externalKey);
    const externalKeys = keys.length > 0 ? keys : [title];

    issues.push({
      title,
      description: description || null,
      status,
      priority,
      effort,
      labels,
      assigneeId,
      dueDate: parseDateValue(cell(row, cols.dueDate)),
      createdAt: parseDateValue(cell(row, cols.createdAt)),
      // Relu uniquement pour les tickets `done` à l'insertion
      // (lib/server/import-issues.ts) : une date de clôture sur une ligne encore
      // ouverte est sans effet.
      completedAt: parseDateValue(cell(row, cols.completedAt)),
      externalKeys,
      parentExternalKey: cell(row, cols.parent) || null,
    });
  }

  return issues;
}
