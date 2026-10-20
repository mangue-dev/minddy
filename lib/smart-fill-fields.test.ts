import { describe, expect, it } from "vitest";
import { smartFillFieldVisible, type SmartFillField } from "./smart-fill-fields";

const EMPTY = { priority: "none", effort: null, categoryIds: [], objectiveId: null };
const FIELDS: SmartFillField[] = ["priority", "effort", "category", "objective"];

describe("smartFillFieldVisible", () => {
  it("shows every property when Smart Fill is off", () => {
    for (const field of FIELDS) {
      expect(smartFillFieldVisible(field, { smartFill: false, openPicker: null, values: EMPTY })).toBe(true);
    }
  });

  it("hides the empty properties Smart Fill will infer", () => {
    for (const field of FIELDS) {
      expect(smartFillFieldVisible(field, { smartFill: true, openPicker: null, values: EMPTY })).toBe(false);
    }
  });

  it("shows only the property whose picker a shortcut opened", () => {
    const visible = FIELDS.filter((field) =>
      smartFillFieldVisible(field, { smartFill: true, openPicker: "effort", values: EMPTY }),
    );
    expect(visible).toEqual(["effort"]);
  });

  it("keeps a property set by hand visible once its picker closes", () => {
    const values = { priority: "high", effort: "s", categoryIds: ["c1"], objectiveId: "o1" };
    for (const field of FIELDS) {
      expect(smartFillFieldVisible(field, { smartFill: true, openPicker: null, values })).toBe(true);
    }
  });

  it("treats the default priority as empty, like the server does", () => {
    const values = { ...EMPTY, priority: "none" };
    expect(smartFillFieldVisible("priority", { smartFill: true, openPicker: null, values })).toBe(false);
  });

  it("shows an objective preset by the board the form opened from", () => {
    const values = { ...EMPTY, objectiveId: "o1" };
    expect(smartFillFieldVisible("objective", { smartFill: true, openPicker: null, values })).toBe(true);
    expect(smartFillFieldVisible("priority", { smartFill: true, openPicker: null, values })).toBe(false);
  });
});
