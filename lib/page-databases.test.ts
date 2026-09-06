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
      "2026-01-01T12:00:00Z",
      "today",
    ]) {
      expect(isDatabaseValue("date", date)).toBe(false);
    }
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
