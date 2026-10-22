import { parseDueDate } from "./due-date";

/** Basic page database properties. Property IDs survive renames and reordering. */
export const DATABASE_PROPERTY_TYPES = [
  "text",
  "number",
  "select",
  "multi_select",
  "created_at",
  "date",
  "people",
  "checkbox",
] as const;
export type DatabasePropertyType = (typeof DATABASE_PROPERTY_TYPES)[number];
export interface DatabaseProperty {
  id: string;
  name: string;
  type: DatabasePropertyType;
  options?: DatabaseSelectOption[];
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
  if (type === "created_at") return false;
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
    case "date": {
      if (typeof value !== "string" || value !== value.trim() ||
          !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d))?$/.test(value))
        return false;
      const calendar = value.slice(0, 10);
      const date = new Date(`${calendar}T00:00:00.000Z`);
      return (
        date.getUTCFullYear() > 0 &&
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === calendar &&
        (value.length === 10 || Number.isFinite(Date.parse(value)))
      );
    }
    case "people":
      return (
        Array.isArray(value) &&
        value.length <= 100 &&
        value.every((id) => typeof id === "string" && UUID.test(id)) &&
        new Set(value).size === value.length
      );
  }
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
  return property?.type === "select" ? name(value) : value;
}

export function compareDatabaseValues(
  a: DatabaseValue | undefined,
  b: DatabaseValue | undefined,
  names: ReadonlyMap<string, string>,
  property?: DatabaseProperty,
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (property?.type === "date" && typeof a === "string" && typeof b === "string" &&
      isDatabaseValue("date", a) && isDatabaseValue("date", b))
    return parseDueDate(a)!.getTime() - parseDueDate(b)!.getTime();
  return databaseValueText(a, names, property).localeCompare(
    databaseValueText(b, names, property),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

/** Match the calendar day shown by the date editor, including timestamps near midnight. */
export function databaseDateMatches(value: DatabaseValue | undefined, day: string): boolean {
  if (typeof value !== "string") return false;
  const date = parseDueDate(value);
  if (!date) return false;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === day;
}

/** Metadata is derived from the entry, never stored as an editable value. */
export function databasePropertyValue(
  page: { created_at?: string; property_values?: DatabaseValues },
  property: DatabaseProperty,
): DatabaseValue {
  return property.type === "created_at"
    ? (page.created_at ?? null)
    : (page.property_values?.[property.id] ?? null);
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

/** Accept decimal punctuation while keeping letters out of numeric editors. */
export function isDatabaseNumberDraft(value: string): boolean {
  return /^[+-]?(?:\d*(?:[.,]\d*)?)$/.test(value);
}

export function parseDatabaseNumber(value: string): number | null | undefined {
  if (!value.trim()) return null;
  if (!isDatabaseNumberDraft(value) || !/\d/.test(value)) return undefined;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

/**
 * The saved view of a database: its sort, filter and hidden columns (MIN-764).
 * It belongs to the database page, so every member sees the same view. The
 * search box is not part of it.
 */
export interface DatabaseView {
  /** `position`, `title` or a property ID. */
  sort: string;
  descending: boolean;
  /** A property ID, or empty for no filter. */
  filter: string;
  filterValue: string;
  hidden: string[];
}
export const DEFAULT_DATABASE_VIEW: DatabaseView = {
  sort: "position",
  descending: false,
  filter: "",
  filterValue: "",
  hidden: [],
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
    !hidden.every((id) => typeof id === "string" && UUID.test(id))
  )
    return null;
  return {
    sort,
    descending,
    filter,
    filterValue: filter ? filterValue : "",
    hidden: [...new Set(hidden as string[])],
  };
}

export function sameDatabaseView(a: DatabaseView, b: DatabaseView): boolean {
  return (
    a.sort === b.sort &&
    a.descending === b.descending &&
    a.filter === b.filter &&
    a.filterValue === b.filterValue &&
    a.hidden.length === b.hidden.length &&
    a.hidden.every((id, index) => id === b.hidden[index])
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
