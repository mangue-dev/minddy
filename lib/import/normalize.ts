// Table access + value normalization shared by the three importers
// (linear.ts / jira.ts / generic.ts). Kept separate from parse.ts so the
// mappers don't import the entry point back (no module cycle).

import type {
  IssueEffortValue,
  IssuePriorityValue,
  IssueStatusValue,
} from "@/lib/issue-validation";
import type { ImportWarning, ImportWarningKey } from "@/lib/import/types";

export interface CsvTable {
  /** Raw header labels, in file order — what the user
 * reads in the lookup table, and the index of a column. */
  headers: string[];
  /** normalized header name → column indexes (repeated columns keep them all). */
  headerIndex: Map<string, number[]>;
  rows: string[][];
}

/** Lowercase, strip accents, collapse separators — used for header names AND
 * enum-ish cell values ​​("To do" → "to do", "In-Progress" → "in progress"). */
export const normalizeToken = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The leading apostrophe that a spreadsheet (and our own export, MIN-348)
 * places before a cell whose first character would make it look like a formula.
 *
 * We remove it when reading, exactly as the spreadsheet removes it when
 * displaying the value: without this, a description beginning with a markdown
 * bullet (`- …`) would come back from a round trip with an extra apostrophe. It
 * is removed only before one of those characters — a real text apostrophe
 * (`'tis`) does not look like one and is left alone.
 */
const ESCAPED_FORMULA = /^'(?=[=+\-@\t\r])/;

/** All non-empty values of a row across these column indexes, in file order. */
export function cells(row: string[], indexes: number[]): string[] {
  const values: string[] = [];
  for (const i of indexes) {
    const value = (row[i] ?? "").trim().replace(ESCAPED_FORMULA, "");
    if (value) values.push(value);
  }
  return values;
}

/** First non-empty value among these column indexes. */
export const cell = (row: string[], indexes: number[]): string =>
  cells(row, indexes)[0] ?? "";

export const hasHeader = (table: CsvTable, ...names: string[]): boolean =>
  names.some((n) => table.headerIndex.has(n));

/** Cap titles defensively — exports can carry pathological rows. */
export const MAX_TITLE_LENGTH = 500;

/** Headers accepted as the title column of a generic CSV (English and French,
 *  including Trello's "Card Name" and Notion's task-name header). Lives here, not in
 *  parse.ts, so the generic mapper can read the same list as `detectSource`
 *  without importing the entry point back: a file detected on one of these
 *  names must map on the same one. */
export const GENERIC_TITLE_HEADERS = [
  "title",
  "titre",
  "summary",
  "task name",
  "nom de la tache",
  "task",
  "tache",
  "name",
  "nom",
  "card name",
];

// ── Warnings ─────────────────────────────────────────────────────────────────

/** Aggregates repeated warnings ("unknown status Blocked" ×12 → one entry). */
export class Warnings {
  private byKey = new Map<string, ImportWarning>();

  add(key: ImportWarningKey, value?: string) {
    const mapKey = `${key}:${value ?? ""}`;
    const existing = this.byKey.get(mapKey);
    if (existing) existing.count += 1;
    else this.byKey.set(mapKey, { key, value, count: 1 });
  }

  list(): ImportWarning[] {
    return [...this.byKey.values()];
  }
}

// ── Enum normalization ───────────────────────────────────────────────────────

const STATUS_ALIASES: Record<string, IssueStatusValue> = {
  triage: "triage",
  backlog: "backlog",
  todo: "todo",
  "to do": "todo",
  "a faire": "todo",
  open: "todo",
  ouvert: "todo",
  new: "todo",
  nouveau: "todo",
  reopened: "todo",
  "selected for development": "todo",
  // Notion's default status column and the most common stage names in a custom
  // table. Without aliases, they would all fall back to backlog.
  "not started": "todo",
  "pas commence": "todo",
  "pas commencee": "todo",
  "non commence": "todo",
  "a demarrer": "todo",
  planned: "todo",
  planifie: "todo",
  planifiee: "todo",
  ready: "todo",
  pret: "todo",
  prete: "todo",
  "ready for dev": "todo",
  "up next": "todo",
  next: "todo",
  "a traiter": "todo",
  "in progress": "in_progress",
  "en cours": "in_progress",
  doing: "in_progress",
  started: "in_progress",
  wip: "in_progress",
  "in development": "in_progress",
  "in review": "in_review",
  "en revue": "in_review",
  "en relecture": "in_review",
  review: "in_review",
  "code review": "in_review",
  qa: "in_review",
  "in qa": "in_review",
  testing: "in_review",
  "en test": "in_review",
  "in testing": "in_review",
  "ready for qa": "in_review",
  "needs review": "in_review",
  "pending review": "in_review",
  "a valider": "in_review",
  "en validation": "in_review",
  "a relire": "in_review",
  done: "done",
  termine: "done",
  terminee: "done",
  closed: "done",
  ferme: "done",
  fermee: "done",
  resolved: "done",
  resolu: "done",
  resolue: "done",
  complete: "done",
  completed: "done",
  fini: "done",
  finished: "done",
  released: "done",
  livre: "done",
  livree: "done",
  shipped: "done",
  deployed: "done",
  deploye: "done",
  deployee: "done",
  merged: "done",
  fusionne: "done",
  delivered: "done",
  canceled: "canceled",
  cancelled: "canceled",
  annule: "canceled",
  annulee: "canceled",
  "wont do": "canceled",
  "wont fix": "canceled",
  wontfix: "canceled",
  declined: "canceled",
  rejected: "canceled",
  abandonne: "canceled",
  abandonnee: "canceled",
  archived: "canceled",
  archive: "canceled",
  archivee: "canceled",
  obsolete: "canceled",
  duplicate: "duplicate",
  doublon: "duplicate",
  duplique: "duplicate",
  dupliquee: "duplicate",
};

/**
 * The status for an already normalized value, or `null` when no table knows it.
 * Deliberately silent here: values that the alias table cannot place are passed
 * to the plan (`buildMapping`), then to the preview's mapping table where the
 * user decides. Clearly ambiguous terms (“Blocked”, “Waiting”, “Paused”) are
 * deliberately NOT aliased — minddy has no status for them, and guessing would
 * affect dozens of tickets.
 */
export const mapStatusToken = (token: string): IssueStatusValue | null =>
  STATUS_ALIASES[token] ?? null;

const PRIORITY_ALIASES: Record<string, IssuePriorityValue> = {
  // “No priority” IS a priority in minddy (`none`), and exports spell it out:
  // “No priority” in Linear and “none” in ours. Without these aliases, the most
  // common value in a priority column would look untranslatable and trigger the
  // model pass.
  none: "none",
  aucune: "none",
  aucun: "none",
  "no priority": "none",
  "sans priorite": "none",
  "pas de priorite": "none",
  urgent: "urgent",
  urgente: "urgent",
  highest: "urgent",
  blocker: "urgent",
  critical: "urgent",
  critique: "urgent",
  p0: "urgent",
  high: "high",
  haute: "high",
  elevee: "high",
  major: "high",
  p1: "high",
  medium: "medium",
  moyenne: "medium",
  normal: "medium",
  normale: "medium",
  p2: "medium",
  low: "low",
  basse: "low",
  faible: "low",
  minor: "low",
  mineure: "low",
  lowest: "low",
  trivial: "low",
  p3: "low",
  p4: "low",
};

/** The priority for a normalized value, `null` if unknown (see `mapStatusToken`). */
export const mapPriorityToken = (token: string): IssuePriorityValue | null =>
  PRIORITY_ALIASES[token] ?? null;

const EFFORT_VALUES = new Set(["xs", "s", "m", "l", "xl"]);

/** Size written out in full — Notion, Asana, and custom tables. */
const EFFORT_ALIASES: Record<string, IssueEffortValue> = {
  "very small": "xs",
  tiny: "xs",
  "tres petit": "xs",
  "tres petite": "xs",
  small: "s",
  petit: "s",
  petite: "s",
  medium: "m",
  moyen: "m",
  moyenne: "m",
  large: "l",
  grand: "l",
  grande: "l",
  "very large": "xl",
  huge: "xl",
  "tres grand": "xl",
  "tres grande": "xl",
  epic: "xl",
};

/** Story points → t-shirt (Linear/Jira exponential-ish scale). */
export function effortFromPoints(raw: string): IssueEffortValue | null {
  const points = Number(raw.replace(",", "."));
  if (!Number.isFinite(points) || points <= 0) return null;
  if (points <= 1) return "xs";
  if (points <= 2) return "s";
  if (points <= 3) return "m";
  if (points <= 5) return "l";
  return "xl";
}

/** Direct t-shirt token or size written out in full. NUMERIC values stay out of
 *  the dictionary: `effortFromPoints` converts them on the fly. */
export const mapEffortToken = (token: string): IssueEffortValue | null =>
  EFFORT_VALUES.has(token)
    ? (token as IssueEffortValue)
    : (EFFORT_ALIASES[token] ?? null);

/** Beyond this, a category name is no longer a label but a sentence — and a
 *  misrouted orphan column would create one on every row. */
export const MAX_LABEL_LENGTH = 60;

/** Split a multi-label cell — Linear joins with ", ", generic CSVs use , or ;. */
export const splitLabels = (raw: string): string[] =>
  raw
    .split(/[,;]/)
    .map((l) => l.trim().slice(0, MAX_LABEL_LENGTH))
    .filter(Boolean);

// ── Dates ────────────────────────────────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// Jira export format: "14/Jul/26 3:42 PM" or "14/Jul/2026".
const JIRA_DATE_RE =
  /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i;
// Notion writes dates out in full, in the workspace language and that language's
// order: “July 14, 2026” or “14 July 2026”. Both pass through here, NOT through
// `new Date`: it reads a date without a time in the LOCAL time zone, moving every
// deadline for a user east of Greenwich back by one day.
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  january: 0, february: 1, march: 2, april: 3, june: 5, july: 6,
  august: 7, september: 8, october: 9, november: 10, december: 11,
  janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11,
  sept: 8,
};
const TIME = String.raw`(?:[\s,]+(\d{1,2}):(\d{2})\s*(AM|PM)?)?`;
// « 14 juillet 2026 », « 14 July 2026 »
const DAY_FIRST_RE = new RegExp(String.raw`^(\d{1,2})\s+([^\d\s.,]+)\.?,?\s+(\d{4})${TIME}$`, "i");
// « July 14, 2026 3:42 PM »
const MONTH_FIRST_RE = new RegExp(String.raw`^([^\d\s.,]+)\.?\s+(\d{1,2}),?\s+(\d{4})${TIME}$`, "i");

/** A date written out in full → ISO, in UTC. `null` if the month is unknown. */
function fromParts(
  day: string,
  monthName: string,
  year: string,
  hour?: string,
  minute?: string,
  meridiem?: string
): string | null {
  const month = MONTHS[normalizeToken(monthName)];
  if (month === undefined) return null;
  let hours = hour ? Number(hour) : 0;
  const upper = meridiem?.toUpperCase();
  if (upper === "PM" && hours < 12) hours += 12;
  if (upper === "AM" && hours === 12) hours = 0;
  const date = new Date(
    Date.UTC(Number(year), month, Number(day), hours, minute ? Number(minute) : 0)
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Best-effort ISO conversion; unparseable values are dropped (null). */
export function parseDateValue(raw: string): string | null {
  // A Notion range (“14 July 2026 → 20 July 2026”): keep the start, the only
  // bound that makes sense for a due date or creation timestamp.
  const value = raw.split(/\s*(?:→|->|–)\s*/)[0].trim();
  if (!value) return null;

  if (ISO_RE.test(value)) return value.replace(" ", "T");

  const dayFirst = DAY_FIRST_RE.exec(value);
  if (dayFirst) {
    const iso = fromParts(
      dayFirst[1], dayFirst[2], dayFirst[3], dayFirst[4], dayFirst[5], dayFirst[6]
    );
    if (iso) return iso;
  }

  const monthFirst = MONTH_FIRST_RE.exec(value);
  if (monthFirst) {
    const iso = fromParts(
      monthFirst[2], monthFirst[1], monthFirst[3], monthFirst[4], monthFirst[5], monthFirst[6]
    );
    if (iso) return iso;
  }

  const jira = JIRA_DATE_RE.exec(value);
  if (jira) {
    let year = Number(jira[3]);
    if (year < 100) year += 2000;
    return fromParts(jira[1], jira[2], String(year), jira[4], jira[5], jira[6]);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return parsed.toISOString();
}
