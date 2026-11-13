import { describe, expect, it } from "vitest";

import { shouldDropCarriedNodeSelection } from "./unfocused-selection";

describe("shouldDropCarriedNodeSelection", () => {
  const carried = { focused: false, docChanged: true, selectionSet: false, nodeSelection: true };

  it("drops a block selection that a content replacement carried into an unfocused editor", () => {
    expect(shouldDropCarriedNodeSelection(carried)).toBe(true);
  });

  it("keeps a selection someone set, or one in a focused editor", () => {
    expect(shouldDropCarriedNodeSelection({ ...carried, selectionSet: true })).toBe(false);
    expect(shouldDropCarriedNodeSelection({ ...carried, focused: true })).toBe(false);
  });

  it("leaves text selections and selection-only transactions alone", () => {
    expect(shouldDropCarriedNodeSelection({ ...carried, nodeSelection: false })).toBe(false);
    expect(shouldDropCarriedNodeSelection({ ...carried, docChanged: false })).toBe(false);
  });
});
