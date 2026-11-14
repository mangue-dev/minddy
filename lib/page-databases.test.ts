import { describe, expect, it } from "vitest";
import {
  isDatabaseSchema,
  isDatabasePropertyValue,
  databaseValueText,
  databasePropertyValue,
  isDatabaseNumberDraft,
  parseDatabaseNumber,
  isDatabaseValue,
  compareDatabaseValues,
  databaseDateMatches,
  databaseViewPositionBetween,
  normalizeDatabaseView,
  normalizeDatabaseViewName,
  DATABASE_AGENT_AUTHOR,
  DATABASE_METADATA_TYPES,
  databaseCalculation,
  databaseDateOccurrence,
  formatDatabaseDate,
  parseDatabaseDate,
  type DatabaseProperty,
} from "./page-databases";

const property = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Due date",
  type: "date",
};

describe("database property validation", () => {
  it("accepts empty databases and schemas with stable identities", () => {
    expect(isDatabaseSchema([])).toBe(true);
    expect(isDatabaseSchema([property])).toBe(true);
    expect(isDatabaseSchema([{ ...property, name: "Delivery" }])).toBe(true);
  });
  it("rejects duplicate IDs, invalid types, blank names, and oversized schemas", () => {
    expect(isDatabaseSchema([property, property])).toBe(false);
    expect(isDatabaseSchema([{ ...property, type: "formula" }])).toBe(false);
    expect(isDatabaseSchema([{ ...property, name: "  " }])).toBe(false);
    expect(isDatabaseSchema([{ ...property, id: "__proto__" }])).toBe(false);
    expect(
      isDatabaseSchema(
        Array.from({ length: 31 }, (_, i) => ({
          ...property,
          id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        })),
      ),
    ).toBe(false);
  });
  it("checks real calendar dates, including leap days", () => {
    expect(isDatabaseValue("date", "2028-02-29")).toBe(true);
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "2026-01-01T12:00:00",
      "2026-02-29T12:00:00Z",
      "2026-04-31T00:00:00.000Z",
      "2026-01-01T24:00:00Z",
      "2026-01-01T12:60:00Z",
      "2026-01-01T12:00:60Z",
      "2026-01-01T12:00:00+16:00",
      "2026-01-01T12:00:00Z\n",
      "0000-01-01",
      "today",
    ]) {
      expect(isDatabaseValue("date", date)).toBe(false);
    }
  });
  it("accepts optional times with an explicit timezone, including midnight", () => {
    for (const value of ["2028-02-29T12:30:00Z", "2026-10-12T00:00:00.000Z",
      "2026-10-12T14:30:00+02:00", "2026-10-12T01:30:00-07:00"])
      expect(isDatabaseValue("date", value)).toBe(true);
    expect(compareDatabaseValues("2026-10-12T14:30:00+02:00", "2026-10-12T13:00:00Z",
      new Map(), { ...property, type: "date" })).toBeLessThan(0);
  });
  it("sorts untimed dates at local midnight and filters timestamps by the displayed day", () => {
    const midnight = new Date(2026, 9, 12, 0, 0).toISOString();
    const late = new Date(2026, 9, 12, 23, 30).toISOString();
    expect(compareDatabaseValues("2026-10-12", midnight, new Map(), { ...property, type: "date" })).toBe(0);
    expect(databaseDateMatches(midnight, "2026-10-12")).toBe(true);
    expect(databaseDateMatches(late, "2026-10-12")).toBe(true);
    expect(databaseDateMatches(late, "2026-10-13")).toBe(false);
    expect(databaseDateMatches("2026-10-12", "2026-10-12")).toBe(true);
    expect(databaseDateMatches(null, "2026-10-12")).toBe(false);
  });
  it("distinguishes single assignment, people lists, and checkboxes", () => {
    expect(isDatabaseValue("people", [property.id])).toBe(true);
    expect(isDatabaseValue("people", property.id)).toBe(false);
    expect(isDatabaseValue("people", [property.id])).toBe(true);
    expect(isDatabaseValue("people", [property.id, property.id])).toBe(false);
    expect(isDatabaseValue("people", ["outsider"])).toBe(false);
    expect(isDatabaseValue("checkbox", false)).toBe(true);
    expect(isDatabaseValue("checkbox", "false")).toBe(false);
    expect(isDatabaseValue("text", "x".repeat(2001))).toBe(false);
    expect(isDatabaseValue("date", null)).toBe(true);
  });
  it("preserves UUID-shaped text while resolving people and selection labels", () => {
    const id = property.id;
    const names = new Map([[id, "Zoe"]]);
    const text = { ...property, type: "text" as const };
    expect(databaseValueText(id, names)).toBe(id);
    expect(databaseValueText(id, names, text)).toBe(id);
    expect(compareDatabaseValues(id, "Alex", names, text)).toBeLessThan(0);
    expect(databaseValueText([id], names, { ...text, type: "people" })).toBe("Zoe");
    const select = { ...text, type: "select" as const, options: [{ id, name: "Ready", color: "#22c55e" }] };
    expect(databaseValueText(id, names, select)).toBe("Ready");
    expect(databaseValueText([id], names, { ...select, type: "multi_select" })).toBe("Ready");
    expect(databaseValueText(id, names, { ...select, options: [] })).toBe(id);
    expect(databaseValueText([id], names, { ...select, type: "multi_select", options: [] })).toBe(id);
  });
  it("sorts people by display name and handles unset values", () => {
    const names = new Map([
      ["one", "Zoe"],
      ["two", "Alex"],
    ]);
    expect(compareDatabaseValues(["one"], ["two"], names)).toBeGreaterThan(0);
    expect(compareDatabaseValues(null, "two", names)).toBeLessThan(0);
    expect(compareDatabaseValues(false, true, names)).toBeLessThan(0);
    expect(
      compareDatabaseValues("2026-01-01", "2026-02-01", names),
    ).toBeLessThan(0);
  });
});

describe("extended database properties", () => {
  const option = { id: property.id, name: "Ready", color: "#22c55e" };
  const select = { ...property, type: "select" as const, options: [option] };
  it("validates options, unique names, colors, and single/multiple cardinality", () => {
    expect(isDatabaseSchema([select])).toBe(true);
    for (const options of [
      [option, option],
      [{ ...option, color: "red" }],
      [{ ...option, name: " " }],
      [
        option,
        {
          ...option,
          id: "10000000-0000-4000-8000-000000000002",
          name: " READY ",
        },
      ],
    ])
      expect(isDatabaseSchema([{ ...select, options }])).toBe(false);
    expect(isDatabasePropertyValue(select, option.id)).toBe(true);
    expect(isDatabasePropertyValue(select, [option.id])).toBe(false);
    expect(
      isDatabasePropertyValue(select, "10000000-0000-4000-8000-000000000002"),
    ).toBe(false);
    const multi = { ...select, type: "multi_select" as const };
    expect(isDatabasePropertyValue(multi, [option.id])).toBe(true);
    expect(isDatabasePropertyValue(multi, [option.id, option.id])).toBe(false);
    expect(isDatabasePropertyValue(multi, [])).toBe(true);
    expect(databaseValueText([option.id], new Map(), multi)).toBe("Ready");
  });
  it("accepts finite numbers, parses decimals, and sorts negatives numerically", () => {
    for (const value of [0, -12.5, 100])
      expect(isDatabaseValue("number", value)).toBe(true);
    for (const value of ["12", "abc", Infinity, NaN])
      expect(isDatabaseValue("number", value)).toBe(false);
    expect(parseDatabaseNumber("-12,5")).toBe(-12.5);
    expect(parseDatabaseNumber(".5")).toBe(0.5);
    expect(parseDatabaseNumber("")).toBeNull();
    expect(parseDatabaseNumber("-")).toBeUndefined();
    expect(parseDatabaseNumber("1e3")).toBeUndefined();
    // Letters pass while typing (a currency code) and are refused on save.
    expect(isDatabaseNumberDraft("12a")).toBe(true);
    expect(parseDatabaseNumber("12a")).toBeUndefined();
    expect(isDatabaseNumberDraft("12!")).toBe(false);
    expect(isDatabaseNumberDraft("-0,")).toBe(true);
    expect(compareDatabaseValues(-10, -2, new Map())).toBeLessThan(0);
  });
  it("reads creation time from metadata and rejects every attempted write", () => {
    const created = { ...property, type: "created_at" as const };
    expect(
      databasePropertyValue(
        {
          created_at: "2026-09-06T12:00:00Z",
          property_values: { [property.id]: "fake" },
        },
        created,
      ),
    ).toBe("2026-09-06T12:00:00Z");
    for (const value of [null, "2026-09-06", "fake", 0])
      expect(isDatabasePropertyValue(created, value)).toBe(false);
  });
});

describe("saved database views", () => {
  const property = "10000000-0000-4000-8000-000000000001";
  const view = { sort: property, descending: true, filter: property,
    filterValue: "Acme", hidden: [property, property] };

  it("keeps a valid view, without duplicate hidden columns or unknown keys", () => {
    expect(normalizeDatabaseView({ ...view, extra: "dropped" })).toEqual({
      ...view, filters: { match: "and", conditions: [] }, hidden: [property],
      calculations: {}, widths: {},
    });
  });

  it("keeps the calculations and column widths of a view, and drops what is malformed", () => {
    const other = "10000000-0000-4000-8000-0000000000cc";
    const normalized = normalizeDatabaseView({ ...view,
      calculations: { [property]: "sum", [other]: "median", nope: "sum" },
      widths: { title: 300.4, [property]: 20, [other]: 5000, nope: 200, text: "wide" } });
    expect(normalized?.calculations).toEqual({ [property]: "sum" });
    expect(normalized?.widths).toEqual({ title: 300, [property]: 80, [other]: 800 });
  });

  it("computes a column's figure on its numbers only", () => {
    const values = [10, 2.5, null, undefined, "x", 7.5];
    expect(databaseCalculation("sum", values)).toBe(20);
    expect(databaseCalculation("average", values)).toBeCloseTo(6.6667, 3);
    expect(databaseCalculation("min", values)).toBe(2.5);
    expect(databaseCalculation("max", values)).toBe(10);
    expect(databaseCalculation("count", values)).toBe(3);
    expect(databaseCalculation("sum", [0.1, 0.2])).toBe(0.3);
    expect(databaseCalculation("sum", [null])).toBeNull();
    expect(databaseCalculation("count", [])).toBe(0);
  });

  it("sorts a selection in the order of its options, empty cells first", () => {
    const [low, high] = ["20000000-0000-4000-8000-0000000000a1", "20000000-0000-4000-8000-0000000000a2"];
    const status = { id: property, name: "Status", type: "select", options: [
      { id: low, name: "Zeta", color: "#000000" }, { id: high, name: "Alpha", color: "#111111" }] } as DatabaseProperty;
    const names = new Map<string, string>();
    // "Zeta" is the first option: it sorts before "Alpha".
    expect(compareDatabaseValues(low, high, names, status)).toBeLessThan(0);
    expect(compareDatabaseValues(null, low, names, status)).toBeLessThan(0);
    const tags = { ...status, type: "multi_select" } as DatabaseProperty;
    expect(compareDatabaseValues([low], [low, high], names, tags)).toBeLessThan(0);
    expect(compareDatabaseValues([high], [low, high], names, tags)).toBeGreaterThan(0);
  });

  it("keeps the filter conditions of a view", () => {
    const filters = { match: "or", conditions: [
      { id: "a", propertyId: property, operator: "contains", value: "Acme" }] };
    expect(normalizeDatabaseView({ ...view, filters })?.filters).toEqual(filters);
  });

  it("drops the filter value of a view without a filter", () => {
    expect(normalizeDatabaseView({ ...view, filter: "" })?.filterValue).toBe("");
  });

  it.each([
    ["an unknown sort", { ...view, sort: "updated_at" }],
    ["a filter that is not a property", { ...view, filter: "title" }],
    ["an oversized filter value", { ...view, filterValue: "x".repeat(201) }],
    ["a hidden column that is not a property", { ...view, hidden: ["title"] }],
    ["a missing direction", { ...view, descending: undefined }],
    ["filters that are not a filter", { ...view, filters: [] }],
  ])("refuses %s", (_case, input) => {
    expect(normalizeDatabaseView(input)).toBeNull();
  });

  it("names a view with trimmed, bounded text", () => {
    expect(normalizeDatabaseViewName("  By owner ")).toBe("By owner");
    expect(normalizeDatabaseViewName(" ")).toBeNull();
    expect(normalizeDatabaseViewName("x".repeat(81))).toBeNull();
  });

  it("places a moved view between its new neighbours", () => {
    expect(databaseViewPositionBetween()).toBe(1);
    expect(databaseViewPositionBetween(undefined, 1)).toBe(0);
    expect(databaseViewPositionBetween(2)).toBe(3);
    expect(databaseViewPositionBetween(1, 2)).toBe(1.5);
  });
});

describe("derived and recurring values (MIN-990)", () => {
  const column = (type: string) => ({ id: "10000000-0000-4000-8000-0000000000aa", name: "Column", type }) as DatabaseProperty;
  const entry = {
    created_at: "2026-01-02T03:04:05.000Z",
    updated_at: "2026-02-03T04:05:06.000Z",
    created_by: "20000000-0000-4000-8000-000000000001",
    updated_by: "20000000-0000-4000-8000-000000000002",
    updated_kind: "human",
  };

  it("reads metadata from the entry and never accepts a written value", () => {
    expect(databasePropertyValue(entry, column("updated_at"))).toBe(entry.updated_at);
    expect(databasePropertyValue(entry, column("created_by"))).toBe(entry.created_by);
    expect(databasePropertyValue(entry, column("updated_by"))).toBe(entry.updated_by);
    for (const type of DATABASE_METADATA_TYPES)
      expect(isDatabaseValue(type, "2026-01-01")).toBe(false);
  });

  it("names the author when nobody edited since, and minddy for an agent edit", () => {
    expect(databasePropertyValue({ ...entry, updated_by: null }, column("updated_by")))
      .toBe(entry.created_by);
    expect(databasePropertyValue({ ...entry, updated_kind: "agent" }, column("updated_by")))
      .toBe(DATABASE_AGENT_AUTHOR);
  });

  it("stores a recurring date as a repeating interval around a plain date", () => {
    expect(formatDatabaseDate("2026-03-31", "monthly")).toBe("R/2026-03-31/P1M");
    expect(formatDatabaseDate("2026-03-31", null)).toBe("2026-03-31");
    expect(parseDatabaseDate("R/2026-03-31/P1M")).toEqual({ date: "2026-03-31", recurrence: "monthly" });
    expect(parseDatabaseDate("2026-03-31T09:00:00.000Z")).toEqual({
      date: "2026-03-31T09:00:00.000Z", recurrence: null });
    expect(isDatabaseValue("date", "R/2026-03-31/P1W")).toBe(true);
    expect(isDatabaseValue("date", "R/2026-02-30/P1W")).toBe(false);
    expect(isDatabaseValue("date", "R/2026-03-31/P2W")).toBe(false);
    expect(isDatabaseValue("date", "R/2026-03-31")).toBe(false);
  });

  it("shows the next occurrence of a recurring day, today included", () => {
    const now = new Date(2026, 10, 14, 15, 0, 0);
    expect(databaseDateOccurrence("2026-01-05", now)).toBe("2026-01-05");
    expect(databaseDateOccurrence("R/2026-11-14/P1W", now)).toBe("2026-11-14");
    expect(databaseDateOccurrence("R/2026-11-02/P1W", now)).toBe("2026-11-16");
    expect(databaseDateOccurrence("R/2026-11-13/P1D", now)).toBe("2026-11-14");
    expect(databaseDateOccurrence("R/2027-01-01/P1Y", now)).toBe("2027-01-01");
    expect(databaseDateOccurrence("R/2024-02-29/P1Y", now)).toBe("2027-02-28");
    expect(databaseDateOccurrence("not a date", now)).toBeNull();
  });

  it("keeps the day of the month across shorter months", () => {
    expect(databaseDateOccurrence("R/2026-01-31/P1M", new Date(2026, 1, 10))).toBe("2026-02-28");
    expect(databaseDateOccurrence("R/2026-01-31/P1M", new Date(2026, 2, 10))).toBe("2026-03-31");
  });

  it("sorts and searches a recurring date by its occurrence", () => {
    const date = column("date");
    const names = new Map<string, string>();
    // Anchored long ago, yearly: its occurrence is after next month's plain date.
    const far = "R/2020-01-01/P1Y";
    const soon = databaseDateOccurrence("R/2020-01-01/P1D") as string;
    expect(compareDatabaseValues(soon, far, names, date)).toBeLessThan(0);
    expect(databaseValueText(far, names, date)).toBe(databaseDateOccurrence(far));
  });

  it("validates a number format on number columns only", () => {
    const base = { id: "10000000-0000-4000-8000-0000000000bb", name: "Price" };
    expect(isDatabaseSchema([{ ...base, type: "number", number_format: "percent" }])).toBe(true);
    expect(isDatabaseSchema([{ ...base, type: "number", number_format: "currency", currency: "EUR" }])).toBe(true);
    expect(isDatabaseSchema([{ ...base, type: "number", number_format: "currency" }])).toBe(false);
    expect(isDatabaseSchema([{ ...base, type: "number", number_format: "currency", currency: "XXX" }])).toBe(false);
    expect(isDatabaseSchema([{ ...base, type: "number", currency: "EUR" }])).toBe(false);
    expect(isDatabaseSchema([{ ...base, type: "text", number_format: "percent" }])).toBe(false);
  });
});
