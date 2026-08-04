// Construction, validation et fusion des plans de lecture (`ImportMapping`).
//
// Trois sources écrivent un plan, et une seule le lit (`lib/import/apply.ts`) :
//   • la détection — les tables d'alias de linear/jira/generic pour les
//     colonnes, et le projet d'arrivée lui-même pour les personnes et les
//     étiquettes (`lib/import/people.ts`) ;
//   • le modèle — `POST /api/projects/[id]/import/plan`, qui voit AUSSI les
//     valeurs, les membres et les catégories, et sait donc placer une colonne
//     « Niveau », un statut « Bloqué » ou rapprocher « M. Dupont » de Marie ;
//   • l'utilisateur — le tableau de correspondance de l'aperçu.
//
// Le plan qui part au commit vient du client : il est donc REJOUÉ contre le
// fichier côté serveur, et passe d'abord par `sanitizeMapping`, qui n'accepte
// que des champs et des valeurs connus, sur le bon nombre de colonnes. Rien de
// ce qui vient du navigateur n'entre ailleurs que par là — y compris les
// identifiants de membres, vérifiés contre la liste réelle du projet.

import {
  isEffort,
  isPriority,
  isStatus,
  type IssueEffortValue,
  type IssuePriorityValue,
  type IssueStatusValue,
} from "@/lib/issue-validation";
import {
  mapEffortToken,
  mapPriorityToken,
  mapStatusToken,
  normalizeToken,
  type CsvTable,
} from "@/lib/import/normalize";
import {
  isImportField,
  type ColumnAliases,
  type ImportContext,
  type ImportField,
  type ImportMapping,
  type ImportSource,
} from "@/lib/import/types";
import { valuesOfColumns, type TableStats } from "@/lib/import/stats";
import {
  buildCategoryIndex,
  buildMemberIndex,
  matchCategory,
  matchMember,
} from "@/lib/import/people";
import { LINEAR_COLUMN_ALIASES } from "@/lib/import/linear";
import { JIRA_COLUMN_ALIASES, jiraStoryPointsHeader } from "@/lib/import/jira";
import { GENERIC_COLUMN_ALIASES } from "@/lib/import/generic";
import { MINDDY_COLUMN_ALIASES } from "@/lib/import/minddy";

/**
 * Assigne les colonnes à partir des noms d'en-tête. La première règle qui
 * matche gagne : l'ordre de la table d'alias porte la priorité (un fichier avec
 * « Title » ET « Name » lit le premier comme titre).
 */
export function assignColumns(table: CsvTable, aliases: ColumnAliases): ImportField[] {
  const columns: ImportField[] = table.headers.map(() => "ignore");
  const taken = new Set<number>();

  for (const [field, names] of aliases) {
    for (const name of names) {
      for (const index of table.headerIndex.get(name) ?? []) {
        if (taken.has(index)) continue;
        taken.add(index);
        columns[index] = field;
      }
    }
  }
  return columns;
}

/** Les index des colonnes qui alimentent un champ. */
export const columnsOf = (mapping: ImportMapping, field: ImportField): number[] =>
  mapping.columns.flatMap((f, i) => (f === field ? [i] : []));

/**
 * Les valeurs distinctes des colonnes à dictionnaire, libellé d'origine
 * compris — ce que le tableau de correspondance affiche. Plafonné : un fichier
 * dont la colonne « statut » a 400 valeurs n'est pas une colonne de statut, et
 * 400 sélecteurs ne sont pas une interface.
 */
export const MAX_VALUE_OPTIONS = 60;

export interface MappingValueOptions {
  status: string[];
  priority: string[];
  effort: string[];
  assignee: string[];
  labels: string[];
}

export function collectValueOptions(
  stats: TableStats,
  mapping: ImportMapping
): MappingValueOptions {
  const list = (...fields: ImportField[]) => {
    const indexes = fields.flatMap((f) => columnsOf(mapping, f));
    return [...valuesOfColumns(stats, indexes).values()]
      .slice(0, MAX_VALUE_OPTIONS)
      .map((v) => v.label);
  };
  return {
    status: list("status"),
    priority: list("priority"),
    effort: list("effort"),
    assignee: list("assignee"),
    // Une cellule d'étiquettes en porte plusieurs : c'est `splitLabels` qui
    // décide, pas la cellule brute.
    labels: splitLabelValues(stats, mapping),
  };
}

/** Les étiquettes distinctes du fichier, cellules multi-valeurs éclatées. */
export function splitLabelValues(stats: TableStats, mapping: ImportMapping): string[] {
  const indexes = [...columnsOf(mapping, "labels"), ...columnsOf(mapping, "extraLabels")];
  const seen = new Map<string, string>();
  for (const value of valuesOfColumns(stats, indexes).values()) {
    for (const label of value.label.split(/[,;]/)) {
      const trimmed = label.trim();
      const token = normalizeToken(trimmed);
      if (token && !seen.has(token)) seen.set(token, trimmed);
    }
    if (seen.size >= MAX_VALUE_OPTIONS) break;
  }
  return [...seen.values()].slice(0, MAX_VALUE_OPTIONS);
}

/**
 * Le plan déduit des en-têtes et de ce que le projet contient déjà — celui
 * d'avant le modèle, et le repli quand il n'est pas disponible. Ce que les
 * tables d'alias et le rapprochement certain ne savent pas placer reste absent,
 * donc visible dans le tableau de correspondance comme une décision à prendre.
 */
export function buildMapping(
  table: CsvTable,
  stats: TableStats,
  source: ImportSource,
  context: ImportContext
): ImportMapping {
  const aliases =
    source === "linear"
      ? LINEAR_COLUMN_ALIASES
      : source === "jira"
        ? JIRA_COLUMN_ALIASES
        : source === "minddy"
          ? MINDDY_COLUMN_ALIASES
          : GENERIC_COLUMN_ALIASES;

  const columns = assignColumns(table, aliases);

  // Jira range les points dans un champ maison dont l'en-tête exact varie
  // (« Custom field (Story Points) », « Story point estimate »…).
  if (source === "jira") {
    const header = jiraStoryPointsHeader(table);
    if (header) {
      for (const index of table.headerIndex.get(header) ?? []) {
        if (columns[index] === "ignore") columns[index] = "effort";
      }
    }
  }

  const draft: ImportMapping = {
    columns,
    statusValues: {},
    priorityValues: {},
    effortValues: {},
    assigneeValues: {},
    labelValues: {},
  };

  const tokensOf = (field: ImportField) =>
    valuesOfColumns(stats, columnsOf(draft, field));

  for (const token of tokensOf("status").keys()) {
    const mapped = mapStatusToken(token);
    if (mapped) draft.statusValues[token] = mapped;
  }
  for (const token of tokensOf("priority").keys()) {
    const mapped = mapPriorityToken(token);
    if (mapped) draft.priorityValues[token] = mapped;
  }
  // Les points chiffrés restent convertis à la volée (`effortFromPoints`) :
  // les lister gonflerait le dictionnaire d'une entrée par valeur numérique.
  for (const token of tokensOf("effort").keys()) {
    const mapped = mapEffortToken(token);
    if (mapped) draft.effortValues[token] = mapped;
  }

  // Personnes : l'égalité d'un e-mail ou d'un nom d'affichage suffit à rendre
  // un ticket à son propriétaire, et c'est le cas de loin le plus fréquent —
  // le fichier vient du même outil, avec les mêmes gens.
  const memberIndex = buildMemberIndex(context.members);
  for (const value of tokensOf("assignee").values()) {
    const userId = matchMember(value.label, memberIndex);
    if (userId) draft.assigneeValues[normalizeToken(value.label)] = userId;
  }

  // Étiquettes : rapprochées des catégories que le projet a DÉJÀ, pour ne pas
  // en fabriquer des jumelles. Ce qui ne correspond à rien reste absent du
  // dictionnaire, donc créé tel quel — le comportement historique.
  const categoryIndex = buildCategoryIndex(context.categories);
  for (const label of splitLabelValues(stats, draft)) {
    const existing = matchCategory(label, categoryIndex);
    if (existing && existing !== label) draft.labelValues[normalizeToken(label)] = existing;
  }

  return draft;
}

/** Une colonne alimente-t-elle vraiment un ticket ? (« ignore » ne compte pas.) */
export const hasTitleColumn = (mapping: ImportMapping): boolean =>
  mapping.columns.includes("title");

/**
 * Reste-t-il quelque chose à gagner à appeler le modèle ? Une colonne qu'on n'a
 * pas su placer, une valeur qu'on n'a pas su traduire, une personne qu'on n'a
 * pas reconnue. Sur un export Linear propre d'un projet dont on connaît déjà
 * les gens, la réponse est non, et l'appel n'a pas lieu.
 *
 * Un export minddy est le cas extrême : ses colonnes sont les nôtres, ses
 * valeurs de statut, de priorité et d'effort sont nos propres énumérations, et
 * les deux colonnes qu'il ne rend pas (`Project`, `Objective`) sont ignorées
 * DÉLIBÉRÉMENT. Il ne reste qu'une inconnue, les gens — un export venu d'un
 * autre espace de travail nomme des personnes que le projet d'arrivée n'a pas
 * forcément. C'est la seule chose qu'on aille demander au modèle.
 */
export function mappingHasGaps(
  stats: TableStats,
  mapping: ImportMapping,
  source: ImportSource = "csv"
): boolean {
  if (!hasTitleColumn(mapping)) return true;

  const missing = (field: ImportField, dict: Record<string, unknown>) => {
    for (const token of valuesOfColumns(stats, columnsOf(mapping, field)).keys()) {
      if (!dict[token]) return true;
    }
    return false;
  };

  if (source === "minddy") return missing("assignee", mapping.assigneeValues);

  // Une colonne toujours vide n'est pas un manque : il n'y a rien à en tirer.
  if (mapping.columns.some((f, i) => f === "ignore" && (stats[i]?.filled ?? 0) > 0)) {
    return true;
  }

  return (
    missing("status", mapping.statusValues) ||
    missing("priority", mapping.priorityValues) ||
    missing("assignee", mapping.assigneeValues)
  );
}

/**
 * Nettoie un plan venu de l'extérieur (navigateur ou modèle). Tout ce qui n'est
 * pas un champ connu, une valeur d'énumération connue, un membre RÉEL du projet
 * ou qui déborde du nombre de colonnes du fichier est écarté silencieusement —
 * le plan reste utilisable, amputé de ce qu'on ne sait pas lire. `null`
 * seulement si l'objet n'a pas la forme attendue du tout.
 */
export function sanitizeMapping(
  columnCount: number,
  context: ImportContext,
  raw: unknown
): ImportMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Partial<Record<keyof ImportMapping, unknown>>;
  if (!Array.isArray(input.columns)) return null;

  const given = input.columns as unknown[];
  const columns: ImportField[] = Array.from({ length: columnCount }, (_, i) =>
    isImportField(given[i]) ? given[i] : "ignore"
  );

  const dict = <T>(value: unknown, guard: (v: unknown) => v is T): Record<string, T> => {
    const out: Record<string, T> = {};
    if (!value || typeof value !== "object") return out;
    for (const [key, target] of Object.entries(value as Record<string, unknown>)) {
      const token = normalizeToken(key);
      if (token && guard(target)) out[token] = target;
    }
    return out;
  };

  // Un identifiant de membre venu du navigateur n'assigne que s'il est
  // vraiment membre du projet : sinon on écrirait un assigné arbitraire.
  const memberIds = new Set(context.members.map((m) => m.userId));
  const isMember = (v: unknown): v is string =>
    typeof v === "string" && memberIds.has(v);

  return {
    columns,
    statusValues: dict<IssueStatusValue>(input.statusValues, isStatus),
    priorityValues: dict<IssuePriorityValue>(input.priorityValues, isPriority),
    effortValues: dict<IssueEffortValue>(input.effortValues, isEffort),
    assigneeValues: dict<string>(input.assigneeValues, isMember),
    // Un nom de catégorie est du texte libre : borné en longueur, c'est tout.
    labelValues: dict<string>(
      input.labelValues,
      (v): v is string => typeof v === "string" && v.length <= 60
    ),
  };
}

/**
 * Fusionne la proposition du modèle avec le plan déduit.
 *
 * `columnsWin` dit qui tranche sur les colonnes DÉJÀ placées :
 *   • export Linear ou Jira → non. Leurs en-têtes sont ceux, exacts, d'un
 *     export connu ; le modèle ne comble que les colonnes laissées de côté.
 *   • CSV générique → oui. Là, la détection ne fait que reconnaître des noms
 *     plausibles, alors que le modèle a lu les valeurs : un fichier dont la
 *     colonne « Name » porte l'assigné et « Task » le titre, seul lui le voit.
 *
 * Les dictionnaires, eux, ne sont jamais écrasés : ce que le rapprochement
 * certain a su traduire est juste, le modèle n'ajoute que le reste.
 */
export function mergeMapping(
  base: ImportMapping,
  proposed: ImportMapping,
  { columnsWin }: { columnsWin: boolean }
): ImportMapping {
  const columns = base.columns.map((field, i) => {
    const next = proposed.columns[i] ?? "ignore";
    if (field === "ignore") return next;
    if (columnsWin && next !== "ignore") return next;
    return field;
  });

  // Une proposition qui perd le titre en route n'est pas une amélioration.
  const keep = !columns.includes("title") && base.columns.includes("title");
  return {
    columns: keep ? base.columns : columns,
    ...fillValues(base, proposed),
  };
}

function fillValues(base: ImportMapping, proposed: ImportMapping) {
  return {
    statusValues: { ...proposed.statusValues, ...base.statusValues },
    priorityValues: { ...proposed.priorityValues, ...base.priorityValues },
    effortValues: { ...proposed.effortValues, ...base.effortValues },
    assigneeValues: { ...proposed.assigneeValues, ...base.assigneeValues },
    labelValues: { ...proposed.labelValues, ...base.labelValues },
  };
}
