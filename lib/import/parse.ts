// Entry point of the CSV importers: papaparse handles the CSV grammar
// (quotes, embedded newlines, CRLF, BOM), the header index maps a name to a
// LIST of column indexes (Jira repeats multi-value columns like "Labels"),
// and detection picks the alias table from the headers alone.
//
// Deux entrées, une seule lecture :
//   • `prepareImport` — celle du navigateur. Rend le tableau, la source et le
//     plan déduit, pour que l'aperçu recalcule les tickets à chaque retouche du
//     tableau de correspondance sans relire le fichier.
//   • `mapCsvToIssues` — celle du serveur (et des tests). Reprend le texte brut,
//     avec le plan reçu du client quand il y en a un, et refait tout.

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
  // Les marqueurs doivent être PROPRES à Linear. « Estimate » en faisait
  // partie et ne l'est pas du tout : n'importe quel CSV maison portant
  // « Title » et « Estimate » était lu comme un export Linear, dont la table
  // d'alias ne connaît que « Parent issue » — et sa colonne « Parent » tombait.
  if (
    hasHeader(table, "title") &&
    hasHeader(table, "team", "creator", "parent issue", "cycle number")
  ) {
    return "linear";
  }
  if (hasHeader(table, ...GENERIC_TITLE_HEADERS)) return "csv";
  return null;
}

/** Tickets + avertissements pour un plan donné. Le seul chemin de lecture. */
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
      /** Le comptage des colonnes, fait une fois — tout le reste le relit. */
      stats: TableStats;
      source: ImportSource;
      mapping: ImportMapping;
    }
  | { ok: false; error: ImportParseError };

/**
 * Ce que le navigateur fait d'un fichier déposé : le tableau, la source et le
 * plan déduit des en-têtes.
 *
 * À la différence de `mapCsvToIssues`, un fichier SANS colonne de titre
 * reconnaissable n'est pas rejeté : c'est un CSV générique dont le plan n'a pas
 * encore de titre, et c'est exactement le cas que le modèle — ou le tableau de
 * correspondance — est là pour régler. Le refus reste, mais au moment de
 * valider, quand plus personne n'a su désigner de titre.
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
 * Un plan reçu de l'extérieur passe par `sanitizeMapping` : il ne peut porter
 * que des champs et des valeurs d'énumération connus, sur les colonnes du
 * fichier tel que le SERVEUR l'a relu.
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

  // Sans colonne de titre, il n'y a pas de ticket à fabriquer — que le plan
  // vienne de la détection ou du navigateur.
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
