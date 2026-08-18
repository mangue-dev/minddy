// Construction, validation and merger of reading plans (`ImportMapping`).
//
// Three sources write a plan, and only one reads it (`lib/import/apply.ts`):
// • detection — linear/jira/generic alias tables for
// columns, and the arrival project itself for people and
// labels (`lib/import/people.ts`);
// • the model — `POST /api/projects/[id]/import/plan`, which ALSO sees the
// values, members and categories, and therefore knows how to place a column
// “Level”, a “Blocked” status or bring “Mr. Dupont” closer to Marie;
// • user — the preview lookup table.
//
// The plan which leaves at commit comes from the client: it is therefore REPLAYED against the
// file on the server side, and first passes through `sanitizeMapping`, which does not accept
// only known fields and values, on the right number of columns. Nothing
// what comes from the browser only enters there - including the
// member IDs, verified against the actual project roster.

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
  IMPORT_FIELDS,
  MULTI_COLUMN_FIELDS,
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
 * Assigns columns based on header names. The first rule that
 * match wins: the order of the alias table has priority (a file with
 * “Title” AND “Name” reads the first as title).
 */
export function assignColumns(table: CsvTable, aliases: ColumnAliases): ImportField[] {
  const columns: ImportField[] = table.headers.map(() => "ignore");
  const takenColumns = new Set<number>();
  // And the opposite: a SIMPLE field is only taken once. An alias table
  // has multiple names for the same field (“Description”, “Notes”, “Body”
  // for `description`), and a file can have them all: both columns
  // then targeted the same field, of which `applyMapping` only reads the first —
  // the second disappeared without a word. Left `ignore`, it returns to
  // On the contrary, a VISIBLE hole, which the model knows how to fill and which the table of
  // match shows. Fields with multiple columns are exempt,
  // that's all in their interest (`MULTI_COLUMN_FIELDS`).
  const takenFields = new Set<ImportField>();

  for (const [field, names] of aliases) {
    for (const name of names) {
      for (const index of table.headerIndex.get(name) ?? []) {
        if (takenColumns.has(index)) continue;
        if (takenFields.has(field)) continue;
        takenColumns.add(index);
        if (!MULTI_COLUMN_FIELDS.has(field)) takenFields.add(field);
        columns[index] = field;
      }
    }
  }
  return columns;
}

/** The indexes of the columns that populate a field. */
export const columnsOf = (mapping: ImportMapping, field: ImportField): number[] =>
  mapping.columns.flatMap((f, i) => (f === field ? [i] : []));

/**
 * What the selector of a column has the right to propose: everything, minus the
 * simple fields that ANOTHER column already occupies (`MULTI_COLUMN_FIELDS`).
 *
 * The current field of the column always appears there, even if it is duplicated —
 * a detected plan can be detected (two “Status” columns in the same file),
 * and a selector whose value is not in its list displays EMPTY. We
 * refuse to aggravate, we do not erase what is there.
 */
export function fieldsAvailableForColumn(
  columns: ImportField[],
  index: number
): ImportField[] {
  const current = columns[index];
  const takenElsewhere = new Set<ImportField>();
  columns.forEach((field, i) => {
    if (i !== index && !MULTI_COLUMN_FIELDS.has(field)) takenElsewhere.add(field);
  });
  return IMPORT_FIELDS.filter(
    (field) => field === current || !takenElsewhere.has(field)
  );
}

/**
 * Distinct values ​​from dictionary columns, original label
 * understood — what the correspondence table displays. Capped: one file
 * whose “status” column has 400 values ​​is not a status column, and
 * 400 selectors are not an interface.
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
    // A cell of labels has several: it is `splitLabels` which
    // decides, not the raw cell.
    labels: splitLabelValues(stats, mapping),
  };
}

/** Distinct file labels, exploded multi-value cells. */
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
 * The plan infers from the headers and what the project already contains — that
 * before the model, and fallback when it is not available. What the
 * alias tables and the certain reconciliation do not know how to place remains absent,
 * therefore visible in the correspondence table as a decision to be made.
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

  // Jira stores points in a house field whose exact header varies
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
  // The encrypted points remain converted on the fly (`effortFromPoints`):
  // listing them would bloat the dictionary by one entry per numeric value.
  for (const token of tokensOf("effort").keys()) {
    const mapped = mapEffortToken(token);
    if (mapped) draft.effortValues[token] = mapped;
  }

  // People: the equality of an email or display name is enough to make
  // a ticket to its owner, and this is by far the most common case —
  // the file comes from the same tool, with the same people.
  const memberIndex = buildMemberIndex(context.members);
  for (const value of tokensOf("assignee").values()) {
    const userId = matchMember(value.label, memberIndex);
    if (userId) draft.assigneeValues[normalizeToken(value.label)] = userId;
  }

  // Tags: compared to the categories that the project ALREADY has, so as not to
  // make binoculars. What does not correspond to anything remains absent from
  // dictionary, therefore created as is — historical behavior.
  const categoryIndex = buildCategoryIndex(context.categories);
  for (const label of splitLabelValues(stats, draft)) {
    const existing = matchCategory(label, categoryIndex);
    if (existing && existing !== label) draft.labelValues[normalizeToken(label)] = existing;
  }

  return draft;
}

/** Does a column really feed a ticket? (“ignore” does not count.) */
export const hasTitleColumn = (mapping: ImportMapping): boolean =>
  mapping.columns.includes("title");

/**
 * Is there anything left to be gained from calling out the model? A column that we don't have
 * not knowing how to place, a value that we have not been able to translate, a person that we have
 * not recognized. On a clean Linear export of a project that we already know about
 * people, the answer is no, and the call is not happening.
 *
 * A minddy export is the extreme case: its columns are ours, its
 * status, priority, and effort values ​​are our own enumerations, and
 * the two columns that it does not render (`Project`, `Objective`) are ignored
 * DELIBERATELY. There's only one unknown left, folks — an export from a
 * other workspace appoints people that the arrival project does not have
 * necessarily. That's the only thing we're going to ask the model.
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

  // A column that is always empty is not a lack: there is nothing to gain from it.
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
 * Cleans a plan from outside (browser or model). Everything that is not
 * not a known field, a known enumeration value, an ACTUAL project member
 * or which exceeds the number of columns of the file is silently discarded —
 * the plan remains usable, amputated of what we cannot read. `null`
 * only if the object doesn't have the expected shape at all.
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

  // A member identifier from the browser only assigns if it is
  // really a member of the project: otherwise we would write an arbitrary assignment.
  const memberIds = new Set(context.members.map((m) => m.userId));
  const isMember = (v: unknown): v is string =>
    typeof v === "string" && memberIds.has(v);

  return {
    columns,
    statusValues: dict<IssueStatusValue>(input.statusValues, isStatus),
    priorityValues: dict<IssuePriorityValue>(input.priorityValues, isPriority),
    effortValues: dict<IssueEffortValue>(input.effortValues, isEffort),
    assigneeValues: dict<string>(input.assigneeValues, isMember),
    // A category name is free text: limited in length, that's all.
    labelValues: dict<string>(
      input.labelValues,
      (v): v is string => typeof v === "string" && v.length <= 60
    ),
  };
}

/**
 * Merges the model proposition with the deduced plan.
 *
 * `columnsWin` says which decides on the columns ALREADY placed:
 * • Linear or Jira export → no. Their headers are those, exact, of a
 * known export; the model only fills in the columns left out.
 * • Generic CSV → yes. There, detection only recognizes names
 * plausible, while the model has read the values: a file whose
 * “Name” column bears the assignee and “Task” the title, only he sees it.
 *
 * Dictionaries are never overwritten: what the comparison
 * someone knew how to translate is correct, the model only adds the rest.
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

  // A proposal that loses the title along the way is not an improvement.
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
