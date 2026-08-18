// Entry point of the CSV importers: papaparse handles the CSV grammar
// (quotes, embedded newlines, CRLF, BOM), the header index maps a name to a
// LIST of column indexes (Jira repeats multi-value columns like "Labels"),
// and detection picks the alias table from the headers alone.
//
// Two entries, one reading:
// • `prepareImport` — that of the browser. Returns the table, source and
// deduced plan, so that the preview recalculates the tickets each time the file is edited
// correspondence table without rereading the file.
// • `mapCsvToIssues` — that of the server (and tests). Takes the raw text,
// with the plan received from the client when there is one, and redo everything.

import Papa from "papaparse";
import {
  EMPTY_IMPORT_CONTEXT,
  MAX_IMPORT_ISSUES,
  type ImportContext,
  type ImportedIssue,
  type ImportMapping,
  type ImportParseError,
  type ImportParseResult,
  type ImportSource,
  type ImportWarning,
} from "@/lib/import/types";
import {
  GENERIC_TITLE_HEADERS,
  hasHeader,
  normalizeToken,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";
import {
  buildMapping,
  hasTitleColumn,
  sanitizeMapping,
} from "@/lib/import/mapping";
import { computeStats, type TableStats } from "@/lib/import/stats";
import { applyMapping } from "@/lib/import/apply";

export function parseCsvTable(csvText: string): CsvTable | null {
  const result = Papa.parse<string[]>(csvText.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  const data = result.data.filter((row) => Array.isArray(row) && row.length > 0);
  if (data.length < 2) return null; // header + at least one data row

  const headers = data[0].map((header) => (header ?? "").trim());
  const headerIndex = new Map<string, number[]>();
  headers.forEach((header, i) => {
    const key = normalizeToken(header);
    if (!key) return;
    const existing = headerIndex.get(key);
    if (existing) existing.push(i);
    else headerIndex.set(key, [i]);
  });
  if (headerIndex.size === 0) return null;

  return { headers, headerIndex, rows: data.slice(1) };
}

export function detectSource(table: CsvTable): ImportSource | null {
  if (
    hasHeader(table, "issue key", "issue id") ||
    (hasHeader(table, "summary") && hasHeader(table, "issue type"))
  ) {
    return "jira";
  }
  // Our own export (`lib/export/issues-csv.ts`). “Objective” is not
  // name of no column in other tools, and “Project” without “Team” or
  // “Issue key” completes the decision: it is a file taken from minddy.
  if (hasHeader(table, "title") && hasHeader(table, "objective") && hasHeader(table, "project")) {
    return "minddy";
  }
  // Markers must be SPECIAL to Linear. “Estimate” made it
  // part and is not at all: any in-house CSV carrying
  // “Title” and “Estimate” were read as a Linear export, whose table
  // alias only knows “Parent issue” — and its “Parent” column was falling out.
  if (
    hasHeader(table, "title") &&
    hasHeader(table, "team", "creator", "parent issue", "cycle number")
  ) {
    return "linear";
  }
  if (hasHeader(table, ...GENERIC_TITLE_HEADERS)) return "csv";
  return null;
}

/** Tickets + warnings for a given plan. The only reading path. */
export function issuesFromMapping(
  table: CsvTable,
  mapping: ImportMapping
): { issues: ImportedIssue[]; warnings: ImportWarning[] } {
  const warnings = new Warnings();
  const issues = applyMapping(table, mapping, warnings);
  resolveParentLinks(issues, warnings);
  return { issues, warnings: warnings.list() };
}

export type ImportPrepareResult =
  | {
      ok: true;
      table: CsvTable;
      /** Column counting, done once — everything else reads it again. */
      stats: TableStats;
      source: ImportSource;
      mapping: ImportMapping;
    }
  | { ok: false; error: ImportParseError };

/**
 * What the browser does with a deposited file: the table, the source and the
 * plan deduced from the headers.
 *
 * Unlike `mapCsvToIssues`, a file WITHOUT recognizable title column
 * is not rejected: it is a generic CSV whose outline doesn't have a title yet, and that's exactly the case that the template — or the correspondence table — is there to address. The refusal remains, but at the time of
 * validate, when no one has been able to designate a title.
 */
export function prepareImport(
  csvText: string,
  context: ImportContext = EMPTY_IMPORT_CONTEXT
): ImportPrepareResult {
  const table = parseCsvTable(csvText);
  if (!table) return { ok: false, error: "empty" };
  if (table.rows.length > MAX_IMPORT_ISSUES) {
    return { ok: false, error: "tooManyIssues" };
  }

  const stats = computeStats(table);
  const source = detectSource(table) ?? "csv";
  return { ok: true, table, stats, source, mapping: buildMapping(table, stats, source, context) };
}

/**
 * Parse + map a CSV export into importable issues. Single source of truth:
 * the settings preview runs it in the browser, the import route re-runs it
 * on the server (the client payload is the raw CSV text, plus the mapping the
 * user saw and possibly corrected).
 *
 * A plan received from the outside goes through `sanitizeMapping`: it can only carry
 * only known fields and enumeration values, on the columns of the
 * file as the SERVER read it.
 */
export function mapCsvToIssues(
  csvText: string,
  rawMapping?: unknown,
  context: ImportContext = EMPTY_IMPORT_CONTEXT
): ImportParseResult {
  const table = parseCsvTable(csvText);
  if (!table) return { ok: false, error: "empty" };

  const detected = detectSource(table);
  const source = detected ?? "csv";

  const provided =
    rawMapping == null
      ? null
      : sanitizeMapping(table.headers.length, context, rawMapping);
  const mapping = provided ?? buildMapping(table, computeStats(table), source, context);

  // Without a title column, there is no ticket to make — only the plan
  // comes from detection or the browser.
  if (!hasTitleColumn(mapping)) return { ok: false, error: "noTitleColumn" };

  const { issues, warnings } = issuesFromMapping(table, mapping);
  if (issues.length > MAX_IMPORT_ISSUES) return { ok: false, error: "tooManyIssues" };

  return { ok: true, source, issues, warnings, mapping };
}

/**
 * Validate parent references against the batch itself: a link must point to a
 * row of the same file, and minddy nests one level only — a child whose parent
 * is itself a sub-issue is flattened to top level.
 */
function resolveParentLinks(issues: ImportedIssue[], warnings: Warnings) {
  const byKey = new Map<string, ImportedIssue>();
  for (const issue of issues) {
    for (const key of issue.externalKeys) byKey.set(normalizeToken(key), issue);
  }

  // Pass 1 — drop links to keys absent from the file (parent not exported).
  for (const issue of issues) {
    if (!issue.parentExternalKey) continue;
    const parent = byKey.get(normalizeToken(issue.parentExternalKey));
    if (!parent || parent === issue) {
      warnings.add("parentNotFound");
      issue.parentExternalKey = null;
    }
  }

  // Pass 2 — flatten links whose parent is still a sub-issue after pass 1.
  for (const issue of issues) {
    if (!issue.parentExternalKey) continue;
    const parent = byKey.get(normalizeToken(issue.parentExternalKey))!;
    if (parent.parentExternalKey) {
      warnings.add("flattenedSubIssue");
      issue.parentExternalKey = null;
    }
  }
}
