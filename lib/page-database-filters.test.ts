import { describe, expect, it } from "vitest";
import type { DatabaseProperty, DatabaseValues } from "./page-databases";
import {
  MAX_DATABASE_FILTER_CONDITIONS,
  databaseFilterOperators,
  legacyDatabaseViewFields,
  legacyDatabaseViewFilter,
  matchesDatabaseFilter,
  normalizeDatabaseViewFilter,
  resolveDatabaseViewFilter,
  type DatabaseFilterCondition,
  type DatabaseViewFilter,
} from "./page-database-filters";

const TEXT = "10000000-0000-4000-8000-000000000001";
const NUMBER = "10000000-0000-4000-8000-000000000002";
const SELECT = "10000000-0000-4000-8000-000000000003";
const MULTI = "10000000-0000-4000-8000-000000000004";
const PEOPLE = "10000000-0000-4000-8000-000000000005";
const DATE = "10000000-0000-4000-8000-000000000006";
const CREATED = "10000000-0000-4000-8000-000000000007";
const CHECK = "10000000-0000-4000-8000-000000000008";
const OPEN = "20000000-0000-4000-8000-000000000001";
const OPENED = "20000000-0000-4000-8000-000000000002";
const CLOSED = "20000000-0000-4000-8000-000000000003";
const ALICE = "30000000-0000-4000-8000-000000000001";
const BOB = "30000000-0000-4000-8000-000000000002";
const GHOST = "40000000-0000-4000-8000-000000000001";

const options = [
  { id: OPEN, name: "Open", color: "#00aa00" },
  { id: OPENED, name: "Reopened", color: "#00aaaa" },
  { id: CLOSED, name: "Closed", color: "#aa0000" },
];
const schema: DatabaseProperty[] = [
  { id: TEXT, name: "Client", type: "text" },
  { id: NUMBER, name: "Amount", type: "number" },
  { id: SELECT, name: "Status", type: "select", options },
  { id: MULTI, name: "Tags", type: "multi_select", options },
  { id: PEOPLE, name: "Owner", type: "people" },
  { id: DATE, name: "Due", type: "date" },
  { id: CREATED, name: "Created", type: "created_at" },
  { id: CHECK, name: "Done", type: "checkbox" },
];

const entry = (values: DatabaseValues, created_at = "2026-09-06T12:00:00Z") =>
  ({ created_at, property_values: values });
const one = (propertyId: string, operator: DatabaseFilterCondition["operator"],
  value?: string): DatabaseViewFilter =>
  ({ match: "and", conditions: [{ id: "c", propertyId, operator, ...(value !== undefined && { value }) }] });
const keeps = (filter: DatabaseViewFilter, values: DatabaseValues, created?: string) =>
  matchesDatabaseFilter(entry(values, created), schema, filter);

describe("operators per property type", () => {
  it("lists them in editor order", () => {
    expect(databaseFilterOperators("text")).toEqual(["contains", "not_contains", "eq", "neq", "empty", "not_empty"]);
    expect(databaseFilterOperators("number")).toEqual(["eq", "neq", "gt", "lt", "empty", "not_empty"]);
    expect(databaseFilterOperators("select")).toEqual(["eq", "neq", "empty", "not_empty"]);
    expect(databaseFilterOperators("multi_select")).toEqual(["contains", "not_contains", "empty", "not_empty"]);
    expect(databaseFilterOperators("people")).toEqual(["contains", "not_contains", "empty", "not_empty"]);
    expect(databaseFilterOperators("date")).toEqual(["eq", "gt", "lt", "empty", "not_empty"]);
    expect(databaseFilterOperators("created_at")).toEqual(["eq", "gt", "lt", "empty", "not_empty"]);
    expect(databaseFilterOperators("checkbox")).toEqual(["eq"]);
  });
});

describe("matchesDatabaseFilter", () => {
  it("matches text case-insensitively", () => {
    const acme = { [TEXT]: "ACME Corp" };
    expect(keeps(one(TEXT, "contains", "acme"), acme)).toBe(true);
    expect(keeps(one(TEXT, "not_contains", "acme"), acme)).toBe(false);
    expect(keeps(one(TEXT, "not_contains", "acme"), {})).toBe(true);
    expect(keeps(one(TEXT, "eq", "acme corp"), acme)).toBe(true);
    expect(keeps(one(TEXT, "eq", "acme"), acme)).toBe(false);
    expect(keeps(one(TEXT, "neq", "acme"), acme)).toBe(true);
    expect(keeps(one(TEXT, "empty"), { [TEXT]: "" })).toBe(true);
    expect(keeps(one(TEXT, "not_empty"), acme)).toBe(true);
  });

  it("compares numbers, with a dot or a comma", () => {
    expect(keeps(one(NUMBER, "eq", "1,5"), { [NUMBER]: 1.5 })).toBe(true);
    expect(keeps(one(NUMBER, "neq", "1.5"), { [NUMBER]: 1.5 })).toBe(false);
    expect(keeps(one(NUMBER, "neq", "1.5"), {})).toBe(true);
    expect(keeps(one(NUMBER, "gt", "10"), { [NUMBER]: 11 })).toBe(true);
    expect(keeps(one(NUMBER, "gt", "10"), { [NUMBER]: 10 })).toBe(false);
    expect(keeps(one(NUMBER, "lt", "10"), { [NUMBER]: -2 })).toBe(true);
    expect(keeps(one(NUMBER, "lt", "10"), {})).toBe(false);
    expect(keeps(one(NUMBER, "empty"), { [NUMBER]: null })).toBe(true);
    expect(keeps(one(NUMBER, "not_empty"), { [NUMBER]: 0 })).toBe(true);
  });

  it("compares a select with an option id", () => {
    expect(keeps(one(SELECT, "eq", OPEN), { [SELECT]: OPEN })).toBe(true);
    expect(keeps(one(SELECT, "eq", OPEN), { [SELECT]: CLOSED })).toBe(false);
    expect(keeps(one(SELECT, "neq", OPEN), {})).toBe(true);
    expect(keeps(one(SELECT, "empty"), {})).toBe(true);
    expect(keeps(one(SELECT, "not_empty"), { [SELECT]: OPEN })).toBe(true);
  });

  it("looks for an option in a multi-select and a member in people", () => {
    expect(keeps(one(MULTI, "contains", OPEN), { [MULTI]: [CLOSED, OPEN] })).toBe(true);
    expect(keeps(one(MULTI, "not_contains", OPEN), { [MULTI]: [CLOSED] })).toBe(true);
    expect(keeps(one(MULTI, "empty"), { [MULTI]: [] })).toBe(true);
    expect(keeps(one(PEOPLE, "contains", ALICE), { [PEOPLE]: [ALICE, BOB] })).toBe(true);
    expect(keeps(one(PEOPLE, "not_contains", ALICE), { [PEOPLE]: [BOB] })).toBe(true);
    expect(keeps(one(PEOPLE, "not_empty"), { [PEOPLE]: [] })).toBe(false);
  });

  it("compares dates by calendar day", () => {
    expect(keeps(one(DATE, "eq", "2026-09-06"), { [DATE]: "2026-09-06" })).toBe(true);
    expect(keeps(one(DATE, "gt", "2026-09-05"), { [DATE]: "2026-09-06" })).toBe(true);
    expect(keeps(one(DATE, "gt", "2026-09-06"), { [DATE]: "2026-09-06" })).toBe(false);
    expect(keeps(one(DATE, "lt", "2026-09-07"), { [DATE]: "2026-09-06" })).toBe(true);
    expect(keeps(one(DATE, "lt", "2026-09-07"), {})).toBe(false);
    expect(keeps(one(DATE, "empty"), {})).toBe(true);
    expect(keeps(one(DATE, "not_empty"), { [DATE]: "2026-09-06" })).toBe(true);
    // The day of creation is read from the entry, as its local day.
    const created = new Date(2026, 8, 6, 12).toISOString();
    expect(keeps(one(CREATED, "eq", "2026-09-06"), {}, created)).toBe(true);
    expect(keeps(one(CREATED, "lt", "2026-09-06"), {}, created)).toBe(false);
  });

  it("compares a checkbox with true or false", () => {
    expect(keeps(one(CHECK, "eq", "true"), { [CHECK]: true })).toBe(true);
    expect(keeps(one(CHECK, "eq", "false"), {})).toBe(true);
    expect(keeps(one(CHECK, "eq", "false"), { [CHECK]: true })).toBe(false);
  });

  it("joins conditions with AND or OR", () => {
    const conditions: DatabaseFilterCondition[] = [
      { id: "a", propertyId: SELECT, operator: "eq", value: OPEN },
      { id: "b", propertyId: NUMBER, operator: "gt", value: "10" },
    ];
    const both = { [SELECT]: OPEN, [NUMBER]: 20 };
    const first = { [SELECT]: OPEN, [NUMBER]: 5 };
    expect(keeps({ match: "and", conditions }, both)).toBe(true);
    expect(keeps({ match: "and", conditions }, first)).toBe(false);
    expect(keeps({ match: "or", conditions }, first)).toBe(true);
    expect(keeps({ match: "or", conditions }, { [NUMBER]: 1 })).toBe(false);
  });

  it("ignores conditions it cannot evaluate, and keeps everything without any", () => {
    expect(keeps({ match: "or", conditions: [] }, {})).toBe(true);
    expect(keeps(one(GHOST, "empty"), { [TEXT]: "x" })).toBe(true);
    expect(keeps(one(TEXT, "contains"), { [TEXT]: "x" })).toBe(true);
    expect(keeps(one(CHECK, "contains", "true"), {})).toBe(true);
    expect(keeps(one(SELECT, "eq", GHOST), { [SELECT]: OPEN })).toBe(true);
    expect(keeps({ match: "and", conditions: [
      { id: "a", propertyId: GHOST, operator: "empty" },
      { id: "b", propertyId: TEXT, operator: "contains", value: "zzz" },
    ] }, { [TEXT]: "x" })).toBe(false);
  });
});

describe("normalizeDatabaseViewFilter", () => {
  it("keeps a valid filter and fills in missing or repeated ids", () => {
    const normalized = normalizeDatabaseViewFilter({ match: "or", extra: 1, conditions: [
      { id: "a", propertyId: TEXT, operator: "contains", value: "x" },
      { id: "a", propertyId: NUMBER, operator: "gt", value: "2" },
      { propertyId: SELECT, operator: "empty", value: "dropped" },
    ] });
    expect(normalized?.match).toBe("or");
    expect(normalized?.conditions.map((condition) => condition.operator)).toEqual(["contains", "gt", "empty"]);
    expect(normalized?.conditions[0].id).toBe("a");
    expect(new Set(normalized?.conditions.map((condition) => condition.id)).size).toBe(3);
    expect(normalized?.conditions[2]).not.toHaveProperty("value");
  });

  it("drops malformed conditions and caps the list", () => {
    const valid = { propertyId: TEXT, operator: "contains", value: "x" };
    const normalized = normalizeDatabaseViewFilter({ conditions: [
      { ...valid, propertyId: "title" },
      { ...valid, operator: "like" },
      { ...valid, value: 3 },
      { ...valid, value: "x".repeat(201) },
      null,
      ...Array.from({ length: 12 }, () => valid),
    ] });
    expect(normalized?.match).toBe("and");
    expect(normalized?.conditions).toHaveLength(MAX_DATABASE_FILTER_CONDITIONS);
  });

  it("refuses what is not a filter", () => {
    expect(normalizeDatabaseViewFilter(null)).toBeNull();
    expect(normalizeDatabaseViewFilter([])).toBeNull();
    expect(normalizeDatabaseViewFilter({ match: "xor" })).toBeNull();
    expect(normalizeDatabaseViewFilter({ conditions: {} })).toBeNull();
  });

  it("checks conditions against a schema, keeping one still waiting for its value", () => {
    const normalized = normalizeDatabaseViewFilter({ conditions: [
      { id: "ghost", propertyId: GHOST, operator: "empty" },
      { id: "operator", propertyId: CHECK, operator: "empty" },
      { id: "option", propertyId: SELECT, operator: "eq", value: GHOST },
      { id: "number", propertyId: NUMBER, operator: "gt", value: "ten" },
      { id: "draft", propertyId: NUMBER, operator: "gt" },
      { id: "kept", propertyId: SELECT, operator: "eq", value: OPEN },
    ] }, schema);
    expect(normalized?.conditions.map((condition) => condition.id)).toEqual(["draft", "kept"]);
  });
});

describe("the single filter of the previous release", () => {
  const legacy = (filter: string, value: string) =>
    legacyDatabaseViewFilter(filter, value, schema).conditions;

  it("converts each property type with its former meaning", () => {
    expect(legacy(CHECK, "true")).toMatchObject([{ operator: "eq", value: "true" }]);
    expect(legacy(CHECK, "")).toMatchObject([{ operator: "eq", value: "false" }]);
    expect(legacy(TEXT, "")).toMatchObject([{ propertyId: TEXT, operator: "empty" }]);
    expect(legacy(DATE, "2026-09-06")).toMatchObject([{ operator: "eq", value: "2026-09-06" }]);
    expect(legacy(PEOPLE, ALICE)).toMatchObject([{ operator: "contains", value: ALICE }]);
    expect(legacy(TEXT, "Acme")).toMatchObject([{ operator: "contains", value: "Acme" }]);
    expect(legacy(NUMBER, "1,5")).toMatchObject([{ operator: "eq", value: "1.5" }]);
  });

  it("maps a select's text to the option it names", () => {
    expect(legacy(SELECT, "open")).toMatchObject([{ operator: "eq", value: OPEN }]);
    expect(legacy(SELECT, "pen")).toMatchObject([{ operator: "eq", value: OPEN }]);
    expect(legacy(MULTI, "clo")).toMatchObject([{ operator: "contains", value: CLOSED }]);
    expect(legacy(SELECT, "pending")).toEqual([]);
  });

  it("drops what cannot be converted", () => {
    expect(legacy(GHOST, "x")).toEqual([]);
    expect(legacy("", "x")).toEqual([]);
    expect(legacy(DATE, "tomorrow")).toEqual([]);
    expect(legacy(NUMBER, "ten")).toEqual([]);
  });

  it("is read when a view has no conditions, and gives stable ids", () => {
    const old = { filters: { match: "and" as const, conditions: [] }, filter: TEXT, filterValue: "Acme" };
    expect(resolveDatabaseViewFilter(old, schema)).toEqual(resolveDatabaseViewFilter(old, schema));
    expect(resolveDatabaseViewFilter(old, schema).conditions).toHaveLength(1);
    const current = { ...old, filters: one(NUMBER, "gt", "1") };
    expect(resolveDatabaseViewFilter(current, schema)).toBe(current.filters);
  });

  it("reads a view the previous release cached on the device, which has no filters at all", () => {
    // The shape a persisted query cache still holds: crashed the database on open.
    const cached = { filter: TEXT, filterValue: "Acme" } as unknown as Parameters<typeof resolveDatabaseViewFilter>[0];
    expect(resolveDatabaseViewFilter(cached, schema).conditions).toHaveLength(1);
    const bare = { filter: "", filterValue: "" } as unknown as Parameters<typeof resolveDatabaseViewFilter>[0];
    expect(resolveDatabaseViewFilter(bare, schema)).toEqual({ match: "and", conditions: [] });
  });

  it("is written back as a superset a former client can apply", () => {
    expect(legacyDatabaseViewFields(one(SELECT, "eq", OPEN), schema))
      .toEqual({ filter: SELECT, filterValue: "Open" });
    expect(legacyDatabaseViewFields(one(CHECK, "eq", "true"), schema))
      .toEqual({ filter: CHECK, filterValue: "true" });
    expect(legacyDatabaseViewFields(one(DATE, "empty"), schema))
      .toEqual({ filter: DATE, filterValue: "" });
    expect(legacyDatabaseViewFields(one(NUMBER, "gt", "3"), schema))
      .toEqual({ filter: "", filterValue: "" });
    const conditions: DatabaseFilterCondition[] = [
      { id: "a", propertyId: NUMBER, operator: "gt", value: "3" },
      { id: "b", propertyId: TEXT, operator: "contains", value: "Acme" },
    ];
    expect(legacyDatabaseViewFields({ match: "and", conditions }, schema))
      .toEqual({ filter: TEXT, filterValue: "Acme" });
    expect(legacyDatabaseViewFields({ match: "or", conditions }, schema))
      .toEqual({ filter: "", filterValue: "" });
  });
});
