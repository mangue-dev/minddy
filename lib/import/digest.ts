// The summary of a file as the model sees it — and the ONLY thing that
// exits the browser for the match pass.
//
// Two reasons not to send the entire CSV: it weighs up to 5 MB, and one
// model has nothing to do with 900 lines that repeat the same thing anyway
// shape. What interests him is three things per column: its header,
// how many distinct values ​​it carries, and what these values ​​look like.
// It's the latter that does all the work: "Level" means nothing,
// “Level” which contains High/Medium/Low is a priority column.
//
// Added to this is what the ARRIVAL PROJECT contains: its members and
// categories. Without them, the model may say "this column is an assigned"
// but not “this assigned one is Marie”, nor “this label is the one
// category Bug you already have”. It's the difference between recognizing the
// form a backlog and really bring it into the project.
//
// Isomorphic: the navigator builds it, the route revalidates it.

import type { ImportContext, ImportField, ImportMapping } from "@/lib/import/types";
import { normalizeToken } from "@/lib/import/normalize";
import { topValues, type TableStats } from "@/lib/import/stats";
import { splitLabelValues } from "@/lib/import/mapping";

/** Beyond that, it is no longer an exported backlog but a spreadsheet. */
export const MAX_DIGEST_COLUMNS = 60;
/** Enough to recognize an enumeration, little enough to stay cheap. */
export const MAX_DIGEST_SAMPLES = 12;
/** An example value is used to recognize a pattern, not to be read in full. */
export const MAX_DIGEST_SAMPLE_CHARS = 80;
/** A project with 200 members or 200 categories: we limit it, the prompt remains readable. */
export const MAX_DIGEST_PROJECT_ITEMS = 100;

export interface CsvDigestColumn {
  index: number;
  header: string;
  distinctCount: number;
  /** Most frequent values ​​first — the order that shows an enumeration. */
  samples: string[];
  /** What the detection has already been able to place (`ignore` otherwise). */
  field: ImportField;
}

export interface CsvDigestMember {
  /** Rank 1-based: a small model copies an integer, not a UUID. */
  ref: number;
  name: string;
}

export interface CsvDigest {
  rowCount: number;
  columns: CsvDigestColumn[];
  /** Project members, those to whom a ticket may come. */
  members: CsvDigestMember[];
  /** Categories already present in the project. */
  categories: string[];
  /** Tags in the file left without an existing category. */
  unmatchedLabels: string[];
}

export function buildCsvDigest(
  stats: TableStats,
  mapping: ImportMapping,
  context: ImportContext,
  rowCount: number
): CsvDigest {
  const columns: CsvDigestColumn[] = [];

  for (const col of stats.slice(0, MAX_DIGEST_COLUMNS)) {
    columns.push({
      index: col.index,
      header: col.header.slice(0, MAX_DIGEST_SAMPLE_CHARS),
      distinctCount: col.distinctCount,
      samples: topValues(col, MAX_DIGEST_SAMPLES).map((v) =>
        v.label.slice(0, MAX_DIGEST_SAMPLE_CHARS)
      ),
      field: mapping.columns[col.index] ?? "ignore",
    });
  }

  // Only the labels that we have not been able to reconcile are submitted: the
  // others are already correct, proposing them to the model would only create the opportunity
  // an error.
  const unmatchedLabels = splitLabelValues(stats, mapping)
    .filter((label) => mapping.labelValues[normalizeToken(label)] === undefined)
    .slice(0, MAX_DIGEST_PROJECT_ITEMS);

  return {
    rowCount,
    columns,
    members: context.members.slice(0, MAX_DIGEST_PROJECT_ITEMS).map((m, i) => ({
      ref: i + 1,
      name: [m.name, m.email].filter(Boolean).join(" ") || `member ${i + 1}`,
    })),
    categories: context.categories.slice(0, MAX_DIGEST_PROJECT_ITEMS),
    unmatchedLabels,
  };
}

/**
 * Revalidation on the road side: the digest comes from the browser, so we recut it
 * at the same terminals before putting it in a prompt. `null` if it's not a
 * digest at all.
 */
export function sanitizeDigest(raw: unknown): CsvDigest | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (!Array.isArray(input.columns) || input.columns.length === 0) return null;

  const strings = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .filter((s): s is string => typeof s === "string")
          .slice(0, MAX_DIGEST_PROJECT_ITEMS)
          .map((s) => s.slice(0, MAX_DIGEST_SAMPLE_CHARS))
      : [];

  const columns: CsvDigestColumn[] = [];
  for (const item of input.columns.slice(0, MAX_DIGEST_COLUMNS)) {
    if (!item || typeof item !== "object") continue;
    const col = item as Record<string, unknown>;
    if (typeof col.index !== "number" || !Number.isInteger(col.index)) continue;
    columns.push({
      index: col.index,
      header:
        typeof col.header === "string"
          ? col.header.slice(0, MAX_DIGEST_SAMPLE_CHARS)
          : "",
      distinctCount: typeof col.distinctCount === "number" ? col.distinctCount : 0,
      samples: strings(col.samples).slice(0, MAX_DIGEST_SAMPLES),
      // The already inferred field is an indication for the model, not an input
      // trusted: it is only used to write the prompt.
      field: typeof col.field === "string" ? (col.field as ImportField) : "ignore",
    });
  }
  if (columns.length === 0) return null;

  const members: CsvDigestMember[] = Array.isArray(input.members)
    ? input.members
        .slice(0, MAX_DIGEST_PROJECT_ITEMS)
        .flatMap((m, i) =>
          m && typeof m === "object" && typeof (m as { name?: unknown }).name === "string"
            ? [
                {
                  ref: i + 1,
                  name: ((m as { name: string }).name).slice(
                    0,
                    MAX_DIGEST_SAMPLE_CHARS
                  ),
                },
              ]
            : []
        )
    : [];

  return {
    rowCount: typeof input.rowCount === "number" ? input.rowCount : 0,
    columns,
    members,
    categories: strings(input.categories),
    unmatchedLabels: strings(input.unmatchedLabels),
  };
}

/** The digest in text, as it appears in the user message. */
export function renderDigest(digest: CsvDigest): string {
  const lines = [`## The file (${digest.rowCount} data rows)`, ""];
  for (const col of digest.columns) {
    const samples = col.samples.map((s) => JSON.stringify(s)).join(", ");
    const already = col.field !== "ignore" ? ` [already mapped to: ${col.field}]` : "";
    lines.push(
      `column ${col.index} — header ${JSON.stringify(col.header)} — ` +
        `${col.distinctCount} distinct values${already}` +
        (samples ? `\n    values: ${samples}` : "\n    values: (always empty)")
    );
  }

  lines.push("", "## The project the issues go into", "");
  lines.push(
    digest.members.length > 0
      ? `members:\n${digest.members.map((m) => `    ${m.ref}. ${m.name}`).join("\n")}`
      : "members: (none — nobody to assign to)"
  );
  lines.push(
    digest.categories.length > 0
      ? `existing categories: ${digest.categories.map((c) => JSON.stringify(c)).join(", ")}`
      : "existing categories: (none)"
  );
  if (digest.unmatchedLabels.length > 0) {
    lines.push(
      `labels in the file with no exact category match: ` +
        digest.unmatchedLabels.map((l) => JSON.stringify(l)).join(", ")
    );
  }

  return lines.join("\n");
}
