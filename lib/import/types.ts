// Shared shapes for the CSV importers (Linear / Jira / generic). Isomorphic:
// the settings UI maps the file client-side for the instant preview, and the
// import route re-runs the exact same mapping server-side on commit.

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";
import type { ResourceInput } from "@/lib/types";

/** Where does the imported batch come from: an uploaded CSV (including a minddy export reread by
 * minddy), the backfill of a repository linked to the activation of issue sync
 * (MIN-97), or the cutting of a brief at the start of a project (MIN-172) — this
 * value is the one that carries the `imported` event from the timeline. */
export type ImportSource =
  | "linear"
  | "jira"
  | "minddy"
  | "csv"
  | "github"
  | "gitlab"
  | "brief";

/**
 * Cap per import — guard against a failed export which would flood a
 * project, not a technical limit: since the numbers are reserved in a
 * call and the identifiers pulled server-side (`lib/server/import-issues.ts`),
 * the cost of an import is round-trips per BATCH, not per ticket.
 * The real ceiling in practice remains `MAX_IMPORT_CSV_BYTES`.
 */
export const MAX_IMPORT_ISSUES = 5000;

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
  /** Project member to return the ticket to, `null` if no one matches. */
  assigneeId: string | null;
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
  /**
 * Arrival objective — a REAL id, resolved by the caller before writing
 * (brief bootstrap creates its objectives first, MIN-172). It travels with the
 * line rather than in a second pass: `importIssuesIntoProject` pulls the
 * identifiers itself and does not return any, so reattaching
 * afterwards would require finding the tickets just inserted. Missing from a
 * import CSV, which has no target to give.
 */
  objectiveId?: string | null;
  /** Identity of the remote issue that this ticket reflects (backfill of a linked repository
 *, MIN-97). Absent for a CSV import. */
  remote?: {
    provider: string;
    repoId: string;
    number: number;
    url: string | null;
  };
  /**
 * Resources to place on the ticket. The backfill of a linked repository puts the LIEN
 * of the remote issue there; a CSV import has none (a file does not have an attachment). These are descriptors ALREADY validated by the caller —
 * the import is a server path, it does not receive anything from a browser.
 */
  resources?: ResourceInput[];
}

// ── Mapping: the reading plan of a file ────────────────────────────────

/**
 * What a CSV column feeds into minddy. A `ImportMapping` carries
 * one per column, in file order: this is the ONLY contract between the
 * detection by headers, the model proposal and the editable table of
 * the preview. The row mapper (`lib/import/apply.ts`) only knows that.
 *
 * Several columns can target the same field (Jira repeats "Labels"): the
 * first non-empty value wins for simple fields, all add up
 * for list fields.
 *
 * `extraLabels` and `extraNote` are the catch-up of the columns for which minddy does not have
 * not the field (assigned, sprint, epic, property Notion house): rather than
 * losing them, we make categories when the column has little distinct
 * values, one line at the bottom of the description otherwise.
 */
export type ImportField =
  | "ignore"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "effort"
  | "labels"
  /** Who takes care of it — closer to the members of the project, cf. `lib/import/people.ts`. */
  | "assignee"
  | "dueDate"
  | "createdAt"
  | "completedAt"
  | "externalKey"
  | "parent"
  /** Jira: a “Won't Do” resolution reclassifies a “Done” status. */
  | "resolution"
  /** Orphan column whose values ​​become categories. */
  | "extraLabels"
  /** Orphan column reported at the bottom of the description, “Header: value”. */
  | "extraNote";

/** Display order in the lookup table selector. */
export const IMPORT_FIELDS: ImportField[] = [
  "ignore",
  "title",
  "description",
  "status",
  "priority",
  "effort",
  "labels",
  "assignee",
  "dueDate",
  "createdAt",
  "completedAt",
  "externalKey",
  "parent",
  "resolution",
  "extraLabels",
  "extraNote",
];

/**
 * Fields that SEVERAL columns can target at once — and only them.
 *
 * It's `applyMapping` that decides, not a display preference: it reads these
 * fields with `cells()`, which takes ALL columns, and all others
 * with `cell()`, which stops at the first non-empty value. A second column
 * title or description is therefore text that no one will ever read —
 * silently, which is the worse of the two. The correspondence table does not
 * offer a simple field already taken elsewhere.
 *
 * The four exceptions are not tolerances, they are needs:
 * - `labels` / `extraLabels`: Jira outputs its multi-valued fields in columns
 * REPEATED (“Labels”, “Labels”, …), and they concatenate;
 * - `extraNote`: each orphan column adds its line at the bottom of the
 * description, that's the whole point;
 * - `externalKey`: a Jira line responds to BOTH its key (PROJ-12) and its
 * numeric id, because "Parent" references one or the other depending on the
 * version (see `lib/import/jira.ts`) — removing the second would break the
 * attachment of subtasks on half of the exports.
 * - `ignore`, finally, which is not a field but its absence.
 */
export const MULTI_COLUMN_FIELDS = new Set<ImportField>([
  "ignore",
  "labels",
  "extraLabels",
  "extraNote",
  "externalKey",
]);

/** A source's alias table: (normalized) header names per field, in
 * priority order — the first rule that matches a column takes it. */
export type ColumnAliases = [ImportField, string[]][];

const IMPORT_FIELD_SET = new Set<string>(IMPORT_FIELDS);
export const isImportField = (value: unknown): value is ImportField =>
  typeof value === "string" && IMPORT_FIELD_SET.has(value);

/**
 * The complete plan for reading a file: where each column goes, and what does
 * return each value in the enumerated columns.
 *
 * Dictionaries are the SINGLE source of truth for values — they are
 * pre-populated by alias tables (`normalize.ts`) when constructing the plan,
 * then completed by the model and modifiable by hand. A value missing from the
 * dictionary is a value that no one has been able to place: mapping it signals it
 * rather than guessing it. Keys are normalized (`normalizeToken`).
 */
export interface ImportMapping {
  /** One field per column of the file, in header order. */
  columns: ImportField[];
  statusValues: Record<string, IssueStatusValue>;
  priorityValues: Record<string, IssuePriorityValue>;
  /** The quantified efforts (story points) remain managed by the conversion. */
  effortValues: Record<string, IssueEffortValue>;
  /**
 * Personal name of file → `user_id` of a project member. Absent = on
 * did not recognize anyone: the ticket remains unassigned and the name goes at the bottom of
 * the description, so that the information does not disappear.
 */
  assigneeValues: Record<string, string>;
  /**
 * File label → category name to use. Absent = we keep
 * the label as is (created if the project does not have it). Empty string = on
 * does not take it back. This is what avoids creating “Bugs” next to the “Bug”
 * which already exists.
 */
  labelValues: Record<string, string>;
}

/**
 * What the arrival project brings to the reconciliation: its members (to
 * return the tickets to their owners) and its categories (to arrange the imported
 * tags in those that exist rather than creating twin
 * ones). Without this context, an import can only guess.
 */
export interface ImportContext {
  members: ImportMember[];
  /** Names of categories already present in the project. */
  categories: string[];
  /** The one that matters — it's HIS backlog, and often its name in the file. */
  actorId: string;
}

export interface ImportMember {
  userId: string;
  email: string | null;
  name: string | null;
}

export const EMPTY_IMPORT_CONTEXT: ImportContext = {
  members: [],
  categories: [],
  actorId: "",
};

/** Warning kinds surfaced in the preview (and echoed by the commit response). */
export type ImportWarningKey =
  | "unknownStatus"
  | "skippedNoTitle"
  | "parentNotFound"
  | "flattenedSubIssue"
  /** A person's name that does not match any member: kept in description. */
  | "unknownAssignee";

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
      /** The plan actually applied (detected, or that received from the caller). */
      mapping: ImportMapping;
    }
  | { ok: false; error: ImportParseError };
