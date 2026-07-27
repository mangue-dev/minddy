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
  /** normalized header name → column indexes (repeated columns keep them all). */
  headerIndex: Map<string, number[]>;
  rows: string[][];
}

/** Lowercase, strip accents, collapse separators — used for header names AND
 *  enum-ish cell values ("À faire" → "a faire", "In-Progress" → "in progress"). */
export const normalizeToken = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** First non-empty value among the columns carrying one of these names. */
export function cell(table: CsvTable, row: string[], ...names: string[]): string {
  for (const name of names) {
    for (const i of table.headerIndex.get(name) ?? []) {
      const value = (row[i] ?? "").trim();
      if (value) return value;
    }
  }
  return "";
}

/** All non-empty values among the columns carrying this name (Jira multi-value). */
export function cells(table: CsvTable, row: string[], name: string): string[] {
  const values: string[] = [];
  for (const i of table.headerIndex.get(name) ?? []) {
    const value = (row[i] ?? "").trim();
    if (value) values.push(value);
  }
  return values;
}

export const hasHeader = (table: CsvTable, ...names: string[]): boolean =>
  names.some((n) => table.headerIndex.has(n));

/** Cap titles defensively — exports can carry pathological rows. */
export const MAX_TITLE_LENGTH = 500;

/** Headers accepted as the title column of a generic CSV (EN + FR + Trello's
 *  "Card Name"). Lives here, not in parse.ts, so the generic mapper can read
 *  the same list as `detectSource` without importing the entry point back:
 *  a file detected on one of these names must map on the same one. */
export const GENERIC_TITLE_HEADERS = [
  "title",
  "titre",
  "summary",
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
  duplicate: "duplicate",
  doublon: "duplicate",
  duplique: "duplicate",
  dupliquee: "duplicate",
};

/** Map a raw status; unknown non-empty values fall back to backlog + warning. */
export function mapStatus(raw: string, warnings: Warnings): IssueStatusValue {
  if (!raw) return "backlog";
  const mapped = STATUS_ALIASES[normalizeToken(raw)];
  if (mapped) return mapped;
  warnings.add("unknownStatus", raw);
  return "backlog";
}

const PRIORITY_ALIASES: Record<string, IssuePriorityValue> = {
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

/** Unknown or empty priorities map to "none" silently. */
export const mapPriority = (raw: string): IssuePriorityValue =>
  PRIORITY_ALIASES[normalizeToken(raw)] ?? "none";

const EFFORT_VALUES = new Set(["xs", "s", "m", "l", "xl"]);

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

/** Direct t-shirt token, else points. */
export function mapEffort(raw: string): IssueEffortValue | null {
  const token = normalizeToken(raw);
  if (EFFORT_VALUES.has(token)) return token as IssueEffortValue;
  return effortFromPoints(raw);
}

/** Split a multi-label cell — Linear joins with ", ", generic CSVs use , or ;. */
export const splitLabels = (raw: string): string[] =>
  raw
    .split(/[,;]/)
    .map((l) => l.trim())
    .filter(Boolean);

// ── Dates ────────────────────────────────────────────────────────────────────

const ISO_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// Jira export format: "14/Jul/26 3:42 PM" or "14/Jul/2026".
const JIRA_DATE_RE =
  /^(\d{1,2})\/([A-Za-z]{3})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?$/i;
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Best-effort ISO conversion; unparseable values are dropped (null). */
export function parseDateValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (ISO_RE.test(value)) return value.replace(" ", "T");

  const jira = JIRA_DATE_RE.exec(value);
  if (jira) {
    const month = MONTHS[jira[2].toLowerCase()];
    if (month === undefined) return null;
    let year = Number(jira[3]);
    if (year < 100) year += 2000;
    let hours = jira[4] ? Number(jira[4]) : 0;
    const minutes = jira[5] ? Number(jira[5]) : 0;
    const meridiem = jira[6]?.toUpperCase();
    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    const date = new Date(Date.UTC(year, month, Number(jira[1]), hours, minutes));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return parsed.toISOString();
}
