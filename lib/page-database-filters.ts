import {
  databaseDateDay,
  databasePropertyValue,
  isDatabaseValue,
  parseDatabaseNumber,
  type DatabaseProperty,
  type DatabasePropertyType,
  type DatabaseValue,
  type DatabaseValues,
  type DatabaseView,
} from "./page-databases";

/**
 * The filters of a saved database view: several conditions joined by AND or
 * OR. Pure, so the table, the API and Numo's tools read them the same way.
 *
 * A condition names its property by id, so it survives a rename. A condition
 * the schema no longer supports (deleted property, deleted option, operator
 * the property type does not take) or still waiting for its value is ignored
 * when entries are matched, never an error: the table keeps showing entries.
 *
 * This module and lib/page-databases.ts import each other; neither reads the
 * other's bindings at load time.
 */

export const DATABASE_FILTER_OPERATORS = [
  "contains",
  "not_contains",
  "eq",
  "neq",
  "gt",
  "lt",
  "empty",
  "not_empty",
] as const;
export type DatabaseFilterOperator = (typeof DATABASE_FILTER_OPERATORS)[number];

export interface DatabaseFilterCondition {
  /** Stable within the view, so an editor can key its rows. */
  id: string;
  propertyId: string;
  operator: DatabaseFilterOperator;
  /** Absent for `empty`/`not_empty`, and while a new condition is being filled in. */
  value?: string;
}

export interface DatabaseViewFilter {
  match: "and" | "or";
  conditions: DatabaseFilterCondition[];
}

export const MAX_DATABASE_FILTER_CONDITIONS = 10;
export const MAX_DATABASE_FILTER_VALUE = 200;

export function emptyDatabaseViewFilter(): DatabaseViewFilter {
  return { match: "and", conditions: [] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONDITION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const OPERATORS: Record<DatabasePropertyType, readonly DatabaseFilterOperator[]> = {
  text: ["contains", "not_contains", "eq", "neq", "empty", "not_empty"],
  number: ["eq", "neq", "gt", "lt", "empty", "not_empty"],
  select: ["eq", "neq", "empty", "not_empty"],
  multi_select: ["contains", "not_contains", "empty", "not_empty"],
  people: ["contains", "not_contains", "empty", "not_empty"],
  date: ["eq", "gt", "lt", "empty", "not_empty"],
  created_at: ["eq", "gt", "lt", "empty", "not_empty"],
  checkbox: ["eq"],
};

/** The operators a property type takes, in the order an editor lists them. */
export function databaseFilterOperators(
  type: DatabasePropertyType,
): readonly DatabaseFilterOperator[] {
  return OPERATORS[type] ?? [];
}

/** Whether the operator compares against a value (`empty`/`not_empty` do not). */
export function databaseFilterNeedsValue(operator: DatabaseFilterOperator): boolean {
  return operator !== "empty" && operator !== "not_empty";
}

/**
 * Whether `value` is something the property can be compared with: a decimal
 * for a number, an option id of the property for a select, a user id for
 * people, a `YYYY-MM-DD` day for a date, `true`/`false` for a checkbox.
 */
export function isDatabaseFilterValue(property: DatabaseProperty, value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > MAX_DATABASE_FILTER_VALUE)
    return false;
  switch (property.type) {
    case "text":
      return true;
    case "number":
      return typeof parseDatabaseNumber(value) === "number";
    case "select":
    case "multi_select":
      return !!property.options?.some((option) => option.id === value);
    case "people":
      return UUID.test(value);
    case "date":
    case "created_at":
      return DAY.test(value) && isDatabaseValue("date", value);
    case "checkbox":
      return value === "true" || value === "false";
  }
}

/** Whether the condition can take part in matching against this schema. */
function usable(condition: DatabaseFilterCondition, schema: readonly DatabaseProperty[]):
  DatabaseProperty | null {
  const property = schema.find((candidate) => candidate.id === condition.propertyId);
  if (!property || !databaseFilterOperators(property.type).includes(condition.operator))
    return null;
  if (databaseFilterNeedsValue(condition.operator) &&
      !isDatabaseFilterValue(property, condition.value)) return null;
  return property;
}

const isEmpty = (value: DatabaseValue | undefined) =>
  value == null || value === "" || (Array.isArray(value) && !value.length);

function matchesCondition(value: DatabaseValue | undefined, property: DatabaseProperty,
  operator: DatabaseFilterOperator, target: string): boolean {
  if (operator === "empty") return isEmpty(value);
  if (operator === "not_empty") return !isEmpty(value);
  switch (property.type) {
    case "text": {
      const text = typeof value === "string" ? value.toLocaleLowerCase() : "";
      const needle = target.toLocaleLowerCase();
      if (operator === "contains") return text.includes(needle);
      if (operator === "not_contains") return !text.includes(needle);
      const equal = text.trim() === needle.trim();
      return operator === "eq" ? equal : !equal;
    }
    case "number": {
      const number = typeof value === "number" ? value : null;
      const bound = parseDatabaseNumber(target) as number;
      if (operator === "eq") return number === bound;
      if (operator === "neq") return number !== bound;
      if (number === null) return false;
      return operator === "gt" ? number > bound : number < bound;
    }
    case "select":
      return operator === "eq" ? value === target : value !== target;
    case "multi_select":
    case "people": {
      const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      return operator === "contains" ? ids.includes(target) : !ids.includes(target);
    }
    case "date":
    case "created_at": {
      const day = databaseDateDay(value);
      if (day === null) return false;
      // Same-length ISO days compare in calendar order.
      return operator === "eq" ? day === target : operator === "gt" ? day > target : day < target;
    }
    case "checkbox":
      return (value === true) === (target === "true");
  }
}

/**
 * Whether an entry meets the view's filter. Conditions the schema cannot
 * evaluate are left out; with none left, every entry matches.
 */
export function matchesDatabaseFilter(
  entry: { created_at?: string; property_values?: DatabaseValues },
  schema: readonly DatabaseProperty[],
  filter: DatabaseViewFilter,
): boolean {
  const active = filter.conditions.flatMap((condition) => {
    const property = usable(condition, schema);
    return property ? [{ condition, property }] : [];
  });
  if (!active.length) return true;
  const test = ({ condition, property }: (typeof active)[number]) =>
    matchesCondition(databasePropertyValue(entry, property), property,
      condition.operator, condition.value ?? "");
  return filter.match === "or" ? active.some(test) : active.every(test);
}

let fallbackId = 0;
function newConditionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  fallbackId += 1;
  return `condition-${Date.now().toString(36)}-${fallbackId}`;
}

/**
 * A stored or submitted filter, or null when it is not one. Conditions with
 * a malformed shape are dropped, the list is capped, and missing or repeated
 * ids are generated. With a schema, conditions it does not support are
 * dropped too; a condition still waiting for its value is kept, so an editor
 * can save it while the user fills it in.
 */
export function normalizeDatabaseViewFilter(
  value: unknown,
  schema?: readonly DatabaseProperty[],
): DatabaseViewFilter | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const match = input.match === undefined ? "and" : input.match;
  if (match !== "and" && match !== "or") return null;
  if (input.conditions !== undefined && !Array.isArray(input.conditions)) return null;
  const ids = new Set<string>();
  const conditions: DatabaseFilterCondition[] = [];
  for (const raw of (input.conditions as unknown[] | undefined) ?? []) {
    if (conditions.length >= MAX_DATABASE_FILTER_CONDITIONS) break;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const { id, propertyId, operator, value: target } = raw as Record<string, unknown>;
    if (typeof propertyId !== "string" || !UUID.test(propertyId) ||
        !DATABASE_FILTER_OPERATORS.includes(operator as DatabaseFilterOperator) ||
        (target !== undefined && (typeof target !== "string" ||
          target.length > MAX_DATABASE_FILTER_VALUE))) continue;
    const op = operator as DatabaseFilterOperator;
    const needsValue = databaseFilterNeedsValue(op);
    const kept = needsValue && typeof target === "string" && target !== "" ? target : undefined;
    if (schema) {
      const property = schema.find((candidate) => candidate.id === propertyId);
      if (!property || !databaseFilterOperators(property.type).includes(op) ||
          (kept !== undefined && !isDatabaseFilterValue(property, kept))) continue;
    }
    const conditionId = typeof id === "string" && CONDITION_ID.test(id) && !ids.has(id)
      ? id : newConditionId();
    ids.add(conditionId);
    conditions.push({ id: conditionId, propertyId, operator: op,
      ...(kept !== undefined && { value: kept }) });
  }
  return { match, conditions };
}

export function sameDatabaseViewFilter(a: DatabaseViewFilter, b: DatabaseViewFilter): boolean {
  return a.match === b.match && a.conditions.length === b.conditions.length &&
    a.conditions.every((condition, index) => {
      const other = b.conditions[index];
      return condition.id === other.id && condition.propertyId === other.propertyId &&
        condition.operator === other.operator && condition.value === other.value;
    });
}

/** The id of a condition converted from the single filter; stable across reads. */
const LEGACY_CONDITION_ID = "legacy";

/**
 * The single filter of the previous release (`filter` + `filterValue`) as a
 * filter, with its semantics as closely as the operators allow: a checkbox
 * compares with "true", an empty value keeps empty entries, a date or a day
 * of creation matches its day, people contain the member, text contains the
 * value and a number equals it. A select used to match the option NAME by
 * substring; it now names the option whose name equals the value (case
 * aside), else the first one containing it. What cannot be converted gives
 * no condition.
 */
export function legacyDatabaseViewFilter(
  filter: string,
  filterValue: string,
  schema: readonly DatabaseProperty[],
): DatabaseViewFilter {
  const property = filter ? schema.find((candidate) => candidate.id === filter) : undefined;
  const result = emptyDatabaseViewFilter();
  if (!property) return result;
  const add = (operator: DatabaseFilterOperator, value?: string) => {
    result.conditions.push({ id: LEGACY_CONDITION_ID, propertyId: property.id, operator,
      ...(value !== undefined && { value }) });
    return result;
  };
  if (property.type === "checkbox") return add("eq", filterValue === "true" ? "true" : "false");
  if (!filterValue) return add("empty");
  switch (property.type) {
    case "date":
    case "created_at":
    case "people":
      if (!isDatabaseFilterValue(property, filterValue)) return result;
      return add(property.type === "people" ? "contains" : "eq", filterValue);
    case "text":
      return filterValue.length <= MAX_DATABASE_FILTER_VALUE ? add("contains", filterValue) : result;
    case "number": {
      const number = parseDatabaseNumber(filterValue);
      return typeof number === "number" ? add("eq", String(number)) : result;
    }
    case "select":
    case "multi_select": {
      const needle = filterValue.trim().toLocaleLowerCase();
      const options = (property.options ?? []).filter((option) =>
        option.name.toLocaleLowerCase().includes(needle));
      const option = options.find((candidate) =>
        candidate.name.trim().toLocaleLowerCase() === needle) ?? options[0];
      if (!option) return result;
      return add(property.type === "select" ? "eq" : "contains", option.id);
    }
  }
}

/**
 * The single filter a client of the previous release should apply, so it
 * shows a superset of what `filter` keeps: the first condition it can express
 * when every condition must hold, the only condition of an OR filter, and no
 * filter otherwise. Select options are written as their name, which that
 * client matched by substring.
 */
export function legacyDatabaseViewFields(
  filter: DatabaseViewFilter,
  schema: readonly DatabaseProperty[],
): { filter: string; filterValue: string } {
  const none = { filter: "", filterValue: "" };
  const active = filter.conditions.flatMap((condition) => {
    const property = usable(condition, schema);
    return property ? [{ condition, property }] : [];
  });
  if (filter.match === "or" && active.length > 1) return none;
  for (const { condition, property } of active) {
    const value = condition.value ?? "";
    const keep = (filterValue: string) => ({ filter: property.id, filterValue });
    if (condition.operator === "empty") return keep("");
    switch (property.type) {
      case "checkbox":
        return keep(value);
      case "text":
        if (condition.operator === "contains" || condition.operator === "eq") return keep(value);
        break;
      case "number":
        if (condition.operator === "eq") return keep(String(parseDatabaseNumber(value)));
        break;
      case "select":
      case "multi_select":
        if (condition.operator === "eq" || condition.operator === "contains")
          return keep(property.options?.find((option) => option.id === value)?.name ?? "");
        break;
      case "people":
        if (condition.operator === "contains") return keep(value);
        break;
      case "date":
      case "created_at":
        if (condition.operator === "eq") return keep(value);
        break;
    }
  }
  return none;
}

/**
 * The filter a view applies: its conditions, or the single filter of a view
 * saved by the previous release, which wrote no condition.
 */
export function resolveDatabaseViewFilter(
  view: Pick<DatabaseView, "filters" | "filter" | "filterValue">,
  schema: readonly DatabaseProperty[],
): DatabaseViewFilter {
  // A view from the previous release may carry no `filters` at all.
  const filters = view.filters ?? emptyDatabaseViewFilter();
  if (filters.conditions.length || !view.filter) return filters;
  return legacyDatabaseViewFilter(view.filter, view.filterValue ?? "", schema);
}

/** The view with `filters` applied and its single-filter mirror rewritten. */
export function withDatabaseViewFilter<T extends Pick<DatabaseView, "filters" | "filter" | "filterValue">>(
  view: T,
  filters: DatabaseViewFilter,
  schema: readonly DatabaseProperty[],
): T {
  return { ...view, filters, ...legacyDatabaseViewFields(filters, schema) };
}
