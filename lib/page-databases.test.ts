import { describe, expect, it } from "vitest";
import {
  isDatabaseSchema,
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
  it("sorts people by display name and handles unset values", () => {
    const names = new Map([
      ["one", "Zoe"],
      ["two", "Alex"],
    ]);
    expect(compareDatabaseValues("one", "two", names)).toBeGreaterThan(0);
    expect(compareDatabaseValues(null, "two", names)).toBeLessThan(0);
    expect(compareDatabaseValues(false, true, names)).toBeLessThan(0);
    expect(
      compareDatabaseValues("2026-01-01", "2026-02-01", names),
    ).toBeLessThan(0);
  });
});
