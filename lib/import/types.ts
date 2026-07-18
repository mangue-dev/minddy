// Shared shapes for the CSV importers (Linear / Jira / generic). Isomorphic:
// the settings UI maps the file client-side for the instant preview, and the
// import route re-runs the exact same mapping server-side on commit.

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";

export type ImportSource = "linear" | "jira" | "csv";

/** Hard cap per import — bounds the route's runtime (number reservation is
 *  one RPC per issue) and keeps a botched export from flooding a project. */
export const MAX_IMPORT_ISSUES = 1000;

/** Raw CSV payload cap accepted by the route (and enforced client-side). */
export const MAX_IMPORT_CSV_BYTES = 5 * 1024 * 1024;

/** One issue as mapped from a CSV row, ready for bulk insert. */
export interface ImportedIssue {
  title: string;
  description: string | null;
  status: IssueStatusValue;
  priority: IssuePriorityValue;
  effort: IssueEffortValue | null;
  /** Label names — resolved to project categories (created on the fly). */
  labels: string[];
  /** ISO date or datetime. */
  dueDate: string | null;
  /** Original creation timestamp (ISO) — preserved on insert when present. */
  createdAt: string | null;
  /** Original completion timestamp (ISO) — only meaningful for done issues. */
  completedAt: string | null;
  /** Identifiers this row answers to (e.g. "ENG-42", a Jira numeric id). */
  externalKeys: string[];
  /** Parent reference (matched against other rows' externalKeys, 1 level max). */
  parentExternalKey: string | null;
}

/** Warning kinds surfaced in the preview (and echoed by the commit response). */
export type ImportWarningKey =
  | "unknownStatus"
  | "skippedNoTitle"
  | "parentNotFound"
  | "flattenedSubIssue";

export interface ImportWarning {
  key: ImportWarningKey;
  /** Interpolated detail (e.g. the unrecognized status name). */
  value?: string;
  count: number;
}

export type ImportParseError = "empty" | "noTitleColumn" | "tooManyIssues";

export type ImportParseResult =
  | {
      ok: true;
      source: ImportSource;
      issues: ImportedIssue[];
      warnings: ImportWarning[];
    }
  | { ok: false; error: ImportParseError };
