/**
 * The CSV format that minddy EXPORTS — the column table, the writing of the
 * file, and the resulting documentation.
 *
 * Three surfaces read this module, and that's the whole point of it being unique:
 * • the road `GET /api/me/issues/export`, which writes the file;
 * • `/llms.txt` and `/llms-full.txt`, which publishes the contract — an agent who
 * receives an export minddy knows which columns it holds without guessing them;
 * • `lib/import/minddy.ts`, whose table alias takes these same headers,
 * so that the file ENTERS into minddy as well as it leaves.
 *
 * The contract is therefore written once. Adding a column here makes it appear
 * in the file, in the published doc and — if it has an arrival field — in
 * the reread on import, instead of the three usual omissions.
 *
 * Pure module (no `server-only`, no access base): testable, and therefore
 * verifiable against import, which is the only guarantee of the round trip.
 */

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";

/** One line to write — what the route has finished resolving (names, identifiers). */
export interface ExportIssueRow {
  /** `<PROJECT KEY>-<number>`, e.g. MIN-42. */
  identifier: string;
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Names of the ticket categories. */
  labels: string[];
  /** Display name of the assignee, `null` if no one. */
  assignee: string | null;
  /** Goal name, `null` if the ticket does not have one. */
  objective: string | null;
  /** Project name — an “all my projects” scope shuffles lines. */
  project: string;
  dueDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  /** Parent identifier (`MIN-40`), `null` at the top level. */
  parent: string | null;
}

export interface ExportColumn {
  /** The header as written to the file. Rereading is insensitive to
 * case (`normalizeToken`), but it is this form which is authentic. */
  header: string;
  /** What the column is about, in English: this sentence IS the published doc. */
  meaning: string;
  value: (row: ExportIssueRow) => string;
}

/** The separator of a multi-value cell. Also the one that `splitLabels`
 * rereads on import — changing one without the other would break the round trip. */
const LABEL_SEPARATOR = ", ";

/**
 * Columns, in file order. The order is the same whatever the
 * requested scope: an export of a single project still carries its column
 * `Project`, so that there is only one format to document and reread.
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  {
    header: "ID",
    meaning:
      "Issue identifier, `<PROJECT KEY>-<number>` (e.g. MIN-42). What the Parent column points at.",
    value: (r) => r.identifier,
  },
  { header: "Title", meaning: "The issue title.", value: (r) => r.title },
  {
    header: "Description",
    meaning: "Markdown, often multi-line — the cell is quoted, newlines are kept.",
    value: (r) => r.description ?? "",
  },
  {
    header: "Status",
    meaning:
      "Raw value, never a translated label: triage, backlog, todo, in_progress, in_review, done, canceled or duplicate.",
    value: (r) => r.status,
  },
  {
    header: "Priority",
    meaning: "Raw value: none, urgent, high, medium or low.",
    value: (r) => r.priority,
  },
  {
    header: "Effort",
    meaning: "T-shirt size: xs, s, m, l, xl — empty when the issue carries none.",
    value: (r) => r.effort ?? "",
  },
  {
    header: "Labels",
    meaning: `The issue's categories, separated by "${LABEL_SEPARATOR.trim()} ".`,
    value: (r) => r.labels.join(LABEL_SEPARATOR),
  },
  {
    header: "Assignee",
    meaning:
      "Display name of the member the issue is assigned to; empty when unassigned.",
    value: (r) => r.assignee ?? "",
  },
  {
    header: "Objective",
    meaning:
      "Name of the objective grouping the issue; empty when it belongs to none.",
    value: (r) => r.objective ?? "",
  },
  {
    header: "Project",
    meaning:
      "Name of the project the issue belongs to — an export can span every project of the account.",
    value: (r) => r.project,
  },
  {
    header: "Due Date",
    meaning: "ISO 8601, empty when the issue has no due date.",
    value: (r) => r.dueDate ?? "",
  },
  { header: "Created", meaning: "ISO 8601 creation timestamp.", value: (r) => r.createdAt ?? "" },
  {
    header: "Completed",
    meaning: "ISO 8601 completion timestamp; only issues that reached done carry one.",
    value: (r) => r.completedAt ?? "",
  },
  {
    header: "Parent",
    meaning:
      "ID of the parent issue, empty at top level. minddy nests one level only, so a parent is never itself a sub-issue.",
    value: (r) => r.parent ?? "",
  },
];

/** Headers only — what source detection reads back (`lib/import/minddy.ts`). */
export const EXPORT_HEADERS: string[] = EXPORT_COLUMNS.map((c) => c.header);

/**
 * Ceiling of an export. Well above `MAX_IMPORT_ISSUES` (5,000): output
 * should not be limited by what can be re-imported at once. When the ceiling is
 * reached, the route says so (`X-Minddy-Truncated` header) — a silently
 * truncated file is the worst export.
 */
export const MAX_EXPORT_ISSUES = 20000;

// ── Writing ──────────────────────────────── ────────────────────────────────

/**
 * The first characters that make a cell a FORMULA when opened.
 *
 * Excel, LibreOffice, and Google Sheets read `=`, `+`, `-`, and `@` at the top from
 * cell as the start of a calculation — and a formula is executed when the file is opened, without anyone having clicked. A tab or carriage return
 * joins them: they are eaten during parsing, and it is the next character that
 * ends up at the top.
 *
 * The content comes from a ticket title or description, therefore from
 * anyone with access to the project : `=HYPERLINK(...)` in a title is enough to
 * transform a colleague's export into a trap (MIN-348).
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * The apostrophe that neutralizes a formula. This is the convention of spreadsheets
 * themselves: they write it on export and eat it on reading, and
 * `lib/import/normalize.ts` does the same — this is what keeps the roundtrip
 * intact on a description that begins with a markdown bullet.
 */
export const FORMULA_GUARD = "'";

/** RFC 4180: we only put quotation marks if necessary, and we double our own.
 A cell that a spreadsheet would read as a formula is neutralized first,
 and is therefore always found between quotation marks. */
function csvCell(value: string): string {
  const safe = FORMULA_LEAD.test(value) ? `${FORMULA_GUARD}${value}` : value;
  if (!/[",\r\n]/.test(safe) && safe === value && safe === safe.trim()) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * The complete file, including the header.
 *
 * CRLF and BOM are not cosmetic: they are the two conditions that let Excel
 * open the file without mangling accents or joining description lines. Our own
 * reader absorbs them (`parseCsvTable` removes the BOM, and papaparse accepts
 * both line endings), so the round trip holds.
 */
export function buildIssuesCsv(rows: ExportIssueRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(c.value(row))).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/**
 * The downloaded file name. The project key is included when the export covers
 * only one project: it is the only word distinguishing two exports from the
 * same day.
 */
export function exportFileName(projectKey: string | null, isoDate: string): string {
  const scope = projectKey ? `-${projectKey.toLowerCase()}` : "";
  return `minddy-issues${scope}-${isoDate}.csv`;
}

// ── Published contract ──────────────────────────────────────────────────────

/** The route that serves the export, as announced in the documentation. */
export const EXPORT_ISSUES_PATH = "/api/me/issues/export";

export interface IssuesCsvDoc {
  purpose: string;
  how: string;
  columns: { header: string; meaning: string }[];
  rules: string[];
  omits: string;
}

/**
 * The contract as data — rendered by `/llms.txt` (the headers) and
 * `/llms-full.txt` (column by column). In English, like the rest of what is
 * published for agents.
 */
export function issuesCsvDoc(): IssuesCsvDoc {
  return {
    purpose:
      "Users can export their issues as CSV. This is the exact shape of the file " +
      "they get, so an agent handed one knows what it holds without guessing.",
    how:
      "In the app: ⌘K → “Export issues as CSV”, then pick the scope (one project " +
      "or every project) and which statuses to include. Over HTTP, as the signed-in " +
      `user: GET ${EXPORT_ISSUES_PATH}?project=<project id|all>&statuses=<comma-separated statuses>. ` +
      "Both parameters are optional and default to everything.",
    columns: EXPORT_COLUMNS.map(({ header, meaning }) => ({ header, meaning })),
    rules: [
      "RFC 4180: comma-separated, CRLF line endings, quotes doubled inside quoted cells.",
      "UTF-8 with a leading BOM, so spreadsheets read accents correctly.",
      "A cell starting with =, +, -, @, a tab or a carriage return is prefixed with a " +
        "single quote, the spreadsheet convention that keeps it text instead of a formula. " +
        "Strip that leading quote when reading the value back — minddy's own importer does.",
      "The header row is always present, and the columns always come in the order above — " +
        "an export scoped to a single project still carries the Project column.",
      "Rows are ordered by project, then by issue number ascending.",
      `At most ${MAX_EXPORT_ISSUES.toLocaleString("en-US")} rows; past that the response carries ` +
        "`X-Minddy-Truncated: true`.",
      "minddy reads this file back (project settings → Import): re-importing an export " +
        "restores titles, descriptions, statuses, priorities, efforts, categories, " +
        "assignees, dates and the parent/child links. Project and Objective are context " +
        "columns — they are written, never read back.",
    ],
    omits:
      "What the file does NOT carry: implementation plans, comments, attachments, " +
      "issue relations, cycle membership, recurrence cadence and the activity timeline. " +
      "Read those over MCP.",
  };
}
