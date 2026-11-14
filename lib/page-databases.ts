import { DATE_ONLY, isDueDateOverdue, parseDueDate } from "./due-date";
import { startDueDate, type RecurrenceCadence } from "./recurrence";
import {
  DATABASE_NUMBER_FORMATS,
  isDatabaseCurrency,
  type DatabaseNumberFormat,
} from "./page-database-number";
import {
  normalizeDatabaseViewFilter,
  sameDatabaseViewFilter,
  type DatabaseViewFilter,
} from "./page-database-filters";

/** Basic page database properties. Property IDs survive renames and reordering. */
export const DATABASE_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "people",
  "checkbox",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
] as const;
export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];

/**
 * Properties read from the entry itself (MIN-990): when it was created or
 * last edited, and by whom. Never stored as a value, never editable.
 */
export const DATABASE_METADATA_TYPES = [
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
] as const satisfies readonly DatabasePropertyType[];
export type DatabaseMetadataType = (typeof DATABASE_METADATA_TYPES)[number];
export function isDatabaseMetadataType(type: unknown): type is DatabaseMetadataType {
  return (DATABASE_METADATA_TYPES as readonly unknown[]).includes(type);
}
/** Properties whose value is a moment: compared as days, sorted in time. */
export function isDatabaseDateType(type: DatabasePropertyType): boolean {
  return type === "date" || type === "created_at" || type === "updated_at";
}
/** Metadata naming one author. */
export function isDatabaseAuthorType(type: DatabasePropertyType): boolean {
  return type === "created_by" || type === "updated_by";
}
/** What an author property holds when the last write came from an agent. */
export const DATABASE_AGENT_AUTHOR = "minddy";

export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: DatabaseSelectOption[];
  /** How a number column shows its values; absent for a plain number. */
  number_format?: DatabaseNumberFormat;
  /** ISO 4217 code of a `currency` column. */
  currency?: string;
}
export interface DatabaseSelectOption {
  id: string;
  name: string;
  color: string;
}
export type DatabaseValue = string | string[] | number | boolean | null;
export const MAX_DATABASE_OPTIONS = 100;
export type DatabaseValues = Record<string, DatabaseValue>;
export const MAX_DATABASE_PROPERTIES = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDatabaseSchema(value: unknown): value is DatabaseProperty[] {
  if (!Array.isArray(value) || value.length > MAX_DATABASE_PROPERTIES)
    return false;
  const ids = new Set<string>();
  return value.every((property) => {
    if (
      !property ||
      typeof property !== "object" ||
      !UUID.test(property.id) ||
      typeof property.name !== "string" ||
      !property.name.trim() ||
      property.name.length > 80 ||
      !DATABASE_PROPERTY_TYPES.includes(property.type) ||
      ids.has(property.id)
    )
      return false;
    if (property.number_format !== undefined || property.currency !== undefined) {
      if (
        property.type !== "number" ||
        !DATABASE_NUMBER_FORMATS.includes(property.number_format) ||
        (property.number_format === "currency") !== (property.currency !== undefined) ||
        (property.currency !== undefined && !isDatabaseCurrency(property.currency))
      )
        return false;
    }
    if (property.options !== undefined) {
      if (
        !["select", "multi_select"].includes(property.type) ||
        !Array.isArray(property.options) ||
        property.options.length > MAX_DATABASE_OPTIONS
      )
        return false;
      const optionIds = new Set<string>();
      const names = new Set<string>();
      for (const option of property.options) {
        if (
          !option ||
          typeof option !== "object" ||
          !UUID.test(option.id) ||
          typeof option.name !== "string" ||
          !option.name.trim() ||
          option.name.length > 80 ||
          typeof option.color !== "string" ||
          !/^#[0-9a-f]{6}$/i.test(option.color) ||
          optionIds.has(option.id) ||
          names.has(option.name.trim().toLowerCase())
        )
          return false;
        optionIds.add(option.id);
        names.add(option.name.trim().toLowerCase());
      }
    }
    ids.add(property.id);
    return true;
  });
}

export function isDatabaseValue(
  type: DatabasePropertyType,
  value: unknown,
): value is DatabaseValue {
  if (isDatabaseMetadataType(type)) return false;
  if (value === null) return true;
  switch (type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "select":
      return typeof value === "string" && UUID.test(value);
    case "multi_select":
      return (
        Array.isArray(value) &&
        value.length <= MAX_DATABASE_OPTIONS &&
        value.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(value).size === value.length
      );
    case "checkbox":
      return typeof value === "boolean";
    case "text":
      return typeof value === "string" && value.length <= 2000;
    case "date":
      return parseDatabaseDate(value) !== null;
    case "people":
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(value).size === value.length
      );
    default:
      return false;
  }
}

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d))?$/;
const RECURRING_DATE = /^R\/([^/]+)\/P1([DWMY])$/;
const CADENCE_CODES = { D: "daily", W: "weekly", M: "monthly", Y: "yearly" } as const;

/** A calendar day or a timestamp, without any recurrence. */
export function isPlainDatabaseDate(value: unknown): value is string {
  if (typeof value !== "string" || !PLAIN_DATE.test(value)) return false;
  const calendar = value.slice(0, 10);
  const date = new Date(`${calendar}T00:00:00.000Z`);
  return (
    date.getUTCFullYear() > 0 &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === calendar &&
    (value.length === 10 || Number.isFinite(Date.parse(value)))
  );
}

/**
 * A date cell (MIN-990): its date, and the cadence when it recurs. A recurring
 * date is stored as an ISO 8601 repeating interval, `R/<date>/P1D|P1W|P1M|P1Y`;
 * `<date>` is the day or timestamp the rhythm starts from.
 */
export interface DatabaseDate {
  date: string;
  recurrence: RecurrenceCadence | null;
}

export function parseDatabaseDate(value: unknown): DatabaseDate | null {
  if (typeof value !== "string") return null;
  const recurring = RECURRING_DATE.exec(value);
  const date = recurring ? recurring[1] : value;
  if (!isPlainDatabaseDate(date)) return null;
  return {
    date,
    recurrence: recurring ? CADENCE_CODES[recurring[2] as keyof typeof CADENCE_CODES] : null,
  };
}

export function formatDatabaseDate(date: string, recurrence: RecurrenceCadence | null): string {
  if (!recurrence) return date;
  const code = (Object.keys(CADENCE_CODES) as (keyof typeof CADENCE_CODES)[])
    .find((key) => CADENCE_CODES[key] === recurrence);
  return `R/${date}/P1${code}`;
}

/**
 * The date a cell stands for now: the stored date, or for a recurring one its
 * next occurrence (today included). Nothing rewrites the cell when a day
 * passes: the occurrence is computed each time it is read. A day stays a day
 * and a timestamp a timestamp.
 */
export function databaseDateOccurrence(value: unknown, now: Date = new Date()): string | null {
  const parsed = parseDatabaseDate(value);
  if (!parsed) return null;
  if (!parsed.recurrence) return parsed.date;
  if (DATE_ONLY.test(parsed.date)) {
    // Calendar arithmetic in UTC, against today's local calendar day: local
    // midnights drift by an hour across a time change.
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const base = new Date(`${parsed.date}T00:00:00.000Z`);
    if (base.getTime() >= today.getTime()) return parsed.date;
    // A UTC midnight is "late" exactly when it is before today's, whatever
    // the local zone makes of its hour.
    const next = startDueDate(base, parsed.recurrence, today);
    return next.toISOString().slice(0, 10);
  }
  const base = parseDueDate(parsed.date);
  if (!base) return null;
  if (!isDueDateOverdue(base, now.getTime())) return parsed.date;
  return startDueDate(base, parsed.recurrence, now).toISOString();
}

export function databaseValueText(
  value: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
  property?: DatabaseProperty,
): string {
  if (value == null) return "";
  const name = (id: string) => {
    if (property?.type === "select" || property?.type === "multi_select")
      return property.options?.find((option) => option.id === id)?.name ?? id;
    return names.get(id) ?? id;
  };
  if (Array.isArray(value)) return value.map(name).join(", ");
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (property?.type === "date") return databaseDateOccurrence(value) ?? value;
  return property?.type === "select" || (property && isDatabaseAuthorType(property.type))
    ? name(value)
    : value;
}

export function compareDatabaseValues(
  a: DatabaseValue | undefined,
  b: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
  property?: DatabaseProperty,
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  // A selection sorts in the order of its options, the one set in the options
  // dialog: "To do" before "Done", whatever their names (MIN-990).
  if (property?.type === "select" || property?.type === "multi_select") {
    const rank = (value: DatabaseValue | undefined) => {
      const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return ids.map((id) => {
        const index = property.options?.findIndex((option) => option.id === id) ?? -1;
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      }).sort((x, y) => x - y);
    };
    const first = rank(a);
    const second = rank(b);
    for (let i = 0; i < Math.max(first.length, second.length); i += 1) {
      // Fewer selections sort first; an empty cell before every option.
      const delta = (first[i] ?? -1) - (second[i] ?? -1);
      if (delta) return delta;
    }
    return 0;
  }
  if (property && isDatabaseDateType(property.type)) {
    const first = parseDueDate(databaseDateOccurrence(a));
    const second = parseDueDate(databaseDateOccurrence(b));
    if (first && second) return first.getTime() - second.getTime();
  }
  return databaseValueText(a, names, property).localeCompare(
    databaseValueText(b, names, property),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

/** The local calendar day (`YYYY-MM-DD`) the date editor shows for a value, or null. */
export function databaseDateDay(value: DatabaseValue | undefined): string | null {
  const date = parseDueDate(databaseDateOccurrence(value));
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Match the calendar day shown by the date editor, including timestamps near midnight. */
export function databaseDateMatches(value: DatabaseValue | undefined, day: string): boolean {
  return databaseDateDay(value) === day;
}

/** What an entry carries for its derived properties. */
export interface DatabaseEntryFields {
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  updated_kind?: string;
  property_values?: DatabaseValues;
}

/** Metadata is derived from the entry, never stored as an editable value. */
export function databasePropertyValue(
  page: DatabaseEntryFields,
  property: DatabaseProperty,
): DatabaseValue {
  switch (property.type) {
    case "created_at":
      return page.created_at ?? null;
    case "updated_at":
      return page.updated_at ?? page.created_at ?? null;
    case "created_by":
      return page.created_by ?? null;
    case "updated_by":
      // Nobody rewrote the entry since its creation: its author stands.
      if (page.updated_by == null) return page.created_by ?? null;
      // An agent writes under a human account; the gesture is minddy's.
      return page.updated_kind === "agent" ? DATABASE_AGENT_AUTHOR : page.updated_by;
    default:
      return page.property_values?.[property.id] ?? null;
  }
}

export function isDatabasePropertyValue(
  property: DatabaseProperty,
  value: unknown,
): value is DatabaseValue {
  if (!isDatabaseValue(property.type, value)) return false;
  if (value === null || !["select", "multi_select"].includes(property.type))
    return true;
  const ids = new Set(property.options?.map((option) => option.id));
  return (Array.isArray(value) ? value : [value]).every(
    (id) => typeof id === "string" && ids.has(id),
  );
}

export { isDatabaseNumberDraft, parseDatabaseNumber } from "./page-database-number";

/**
 * The saved view of a database: its sort, filters and hidden columns (MIN-764).
 * It belongs to the database page, so every member sees the same view. The
 * search box is not part of it.
 */
export interface DatabaseView {
  /** `position`, `title` or a property ID. */
  sort: string;
  descending: boolean;
  /**
   * The conditions an entry must meet (lib/page-database-filters.ts). A view
   * saved before they existed has none and keeps its single filter in
   * `filter`/`filterValue`; `resolveDatabaseViewFilter` converts it.
   */
  filters: DatabaseViewFilter;
  /**
   * The single filter of the previous release, still written as a mirror of
   * `filters` so a client running it shows a superset of the entries rather
   * than ignoring the filter. A property ID, or empty for no filter.
   */
  filter: string;
  filterValue: string;
  hidden: string[];
  /** The figure shown under a number column, by property id (MIN-990). */
  calculations: Record<string, DatabaseCalculation>;
  /** Column widths set by hand, in pixels, by property id or `title`. */
  widths: Record<string, number>;
}
export const DATABASE_CALCULATIONS = ["sum", "average", "min", "max", "count"] as const;
export type DatabaseCalculation = (typeof DATABASE_CALCULATIONS)[number];
export const MIN_DATABASE_COLUMN_WIDTH = 80;
export const MAX_DATABASE_COLUMN_WIDTH = 800;

/** The figure a calculation gives for a column's values; null without any number. */
export function databaseCalculation(
  kind: DatabaseCalculation,
  values: readonly (DatabaseValue | undefined)[],
): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  if (kind === "count") return numbers.length;
  if (!numbers.length) return null;
  const total = numbers.reduce((sum, value) => sum + value, 0);
  const result = kind === "sum" ? total
    : kind === "average" ? total / numbers.length
    : kind === "min" ? Math.min(...numbers) : Math.max(...numbers);
  // Binary floats leak into sums: 0.1 + 0.2 reads 0.3.
  return Number(result.toPrecision(12));
}

export const DEFAULT_DATABASE_VIEW: DatabaseView = {
  sort: "position",
  descending: false,
  // Written out rather than imported: the two modules import each other.
  filters: { match: "and", conditions: [] },
  filter: "",
  filterValue: "",
  hidden: [],
  calculations: {},
  widths: {},
};
const MAX_VIEW_FILTER_LENGTH = 200;
const VIEW_PROPERTY = /^(?:position|title|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * The stored view, or null when the input is not one. Unknown keys are
 * dropped; a property that no longer exists stays harmless because the table
 * ignores a sort, filter or hidden column it cannot find.
 */
export function normalizeDatabaseView(value: unknown): DatabaseView | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const { sort, descending, filter, filterValue, hidden } = input;
  // Views saved before MIN-990 carry neither; a malformed entry is dropped.
  const entries = (raw: unknown) => raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.entries(raw as Record<string, unknown>).slice(0, MAX_DATABASE_PROPERTIES + 1) : [];
  const calculations = Object.fromEntries(entries(input.calculations).filter(([id, kind]) =>
    UUID.test(id) && DATABASE_CALCULATIONS.includes(kind as DatabaseCalculation))) as
    Record<string, DatabaseCalculation>;
  const widths = Object.fromEntries(entries(input.widths).flatMap(([id, width]) =>
    (id === "title" || UUID.test(id)) && typeof width === "number" && Number.isFinite(width)
      ? [[id, Math.round(Math.min(MAX_DATABASE_COLUMN_WIDTH,
          Math.max(MIN_DATABASE_COLUMN_WIDTH, width)))]] : [])) as Record<string, number>;
  // A view written by the previous release has no `filters` at all.
  const filters = input.filters === undefined
    ? { match: "and" as const, conditions: [] }
    : normalizeDatabaseViewFilter(input.filters);
  if (
    typeof sort !== "string" ||
    !VIEW_PROPERTY.test(sort) ||
    typeof descending !== "boolean" ||
    typeof filter !== "string" ||
    (filter !== "" && !UUID.test(filter)) ||
    typeof filterValue !== "string" ||
    filterValue.length > MAX_VIEW_FILTER_LENGTH ||
    !Array.isArray(hidden) ||
    hidden.length > MAX_DATABASE_PROPERTIES ||
    !hidden.every((id) => typeof id === "string" && UUID.test(id)) ||
    !filters
  )
    return null;
  return {
    sort,
    descending,
    filters,
    filter,
    filterValue: filter ? filterValue : "",
    hidden: [...new Set(hidden as string[])],
    calculations,
    widths,
  };
}

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export function sameDatabaseView(a: DatabaseView, b: DatabaseView): boolean {
  return (
    a.sort === b.sort &&
    a.descending === b.descending &&
    a.filter === b.filter &&
    a.filterValue === b.filterValue &&
    sameDatabaseViewFilter(a.filters, b.filters) &&
    a.hidden.length === b.hidden.length &&
    a.hidden.every((id, index) => id === b.hidden[index]) &&
    sameRecord(a.calculations ?? {}, b.calculations ?? {}) &&
    sameRecord(a.widths ?? {}, b.widths ?? {})
  );
}

/** A named view of a database, shared by the project (MIN-764). */
export interface SavedDatabaseView {
  id: string;
  name: string;
  /** The shared order of the view strip, ascending. */
  position: number;
  view: DatabaseView;
}
export const MAX_DATABASE_VIEWS = 20;
export const MAX_DATABASE_VIEW_NAME = 80;

export function normalizeDatabaseViewName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= MAX_DATABASE_VIEW_NAME ? name : null;
}

/** The position between two neighbours of the strip (either may be missing). */
export function databaseViewPositionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}
