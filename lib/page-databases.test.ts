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
    expect(isDatabaseNumberDraft("12a")).toBe(false);
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
      ...view, hidden: [property],
    });
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
