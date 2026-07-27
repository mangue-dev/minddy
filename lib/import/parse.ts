// Entry point of the CSV importers: papaparse handles the CSV grammar
// (quotes, embedded newlines, CRLF, BOM), the header index maps a name to a
// LIST of column indexes (Jira repeats multi-value columns like "Labels"),
// and detection picks the mapper from the headers alone.

import Papa from "papaparse";
import {
  MAX_IMPORT_ISSUES,
  type ImportedIssue,
  type ImportParseResult,
  type ImportSource,
} from "@/lib/import/types";
import {
  GENERIC_TITLE_HEADERS,
  hasHeader,
  normalizeToken,
  Warnings,
  type CsvTable,
} from "@/lib/import/normalize";
import { mapLinearRows } from "@/lib/import/linear";
import { mapJiraRows } from "@/lib/import/jira";
import { mapGenericRows } from "@/lib/import/generic";

export function parseCsvTable(csvText: string): CsvTable | null {
  const result = Papa.parse<string[]>(csvText.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  const data = result.data.filter((row) => Array.isArray(row) && row.length > 0);
  if (data.length < 2) return null; // header + at least one data row

  const headerIndex = new Map<string, number[]>();
  data[0].forEach((header, i) => {
    const key = normalizeToken(header ?? "");
    if (!key) return;
    const existing = headerIndex.get(key);
    if (existing) existing.push(i);
    else headerIndex.set(key, [i]);
  });
  if (headerIndex.size === 0) return null;

  return { headerIndex, rows: data.slice(1) };
}

export function detectSource(table: CsvTable): ImportSource | null {
  if (
    hasHeader(table, "issue key", "issue id") ||
    (hasHeader(table, "summary") && hasHeader(table, "issue type"))
  ) {
    return "jira";
  }
  if (
    hasHeader(table, "title") &&
    hasHeader(table, "team", "creator", "parent issue", "cycle number", "estimate")
  ) {
    return "linear";
  }
  if (hasHeader(table, ...GENERIC_TITLE_HEADERS)) return "csv";
  return null;
}

/**
 * Parse + map a CSV export into importable issues. Single source of truth:
 * the settings preview runs it in the browser, the import route re-runs it
 * on the server (the client payload is just the raw CSV text).
 */
export function mapCsvToIssues(csvText: string): ImportParseResult {
  const table = parseCsvTable(csvText);
  if (!table) return { ok: false, error: "empty" };

  const source = detectSource(table);
  if (!source) return { ok: false, error: "noTitleColumn" };

  const warnings = new Warnings();
  const issues =
    source === "linear"
      ? mapLinearRows(table, warnings)
      : source === "jira"
        ? mapJiraRows(table, warnings)
        : mapGenericRows(table, warnings);

  if (issues.length > MAX_IMPORT_ISSUES) return { ok: false, error: "tooManyIssues" };

  resolveParentLinks(issues, warnings);
  return { ok: true, source, issues, warnings: warnings.list() };
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
