import { describe, expect, it } from "vitest";
import { sanitizeViewConfig } from "./views";

describe("sanitizeViewConfig — effort filter (MIN-790)", () => {
  it("keeps null, which selects the issues whose effort is not set", () => {
    const { filters, invalid } = sanitizeViewConfig({ filters: { effort: [null, "s"] } });
    expect(filters.effort).toEqual([null, "s"]);
    expect(invalid).toEqual([]);
  });

  it("still drops values outside the effort enum", () => {
    const { filters, invalid } = sanitizeViewConfig({ filters: { effort: ["huge", "m"] } });
    expect(filters.effort).toEqual(["m"]);
    expect(invalid).toEqual([
      'filters.effort: dropped invalid value(s) "huge" (allowed: xs, s, m, l, xl, null)',
    ]);
  });
});
