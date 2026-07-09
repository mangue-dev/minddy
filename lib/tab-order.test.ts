import { describe, expect, it } from "vitest";
import { CYCLE_TAB_KEY, mergeTabOrder } from "./tab-order";

describe("mergeTabOrder", () => {
  const DEFAULT = ["a", "b", "c", CYCLE_TAB_KEY];

  it("returns the default order verbatim when nothing is stored", () => {
    expect(mergeTabOrder(DEFAULT, null)).toEqual(DEFAULT);
    expect(mergeTabOrder(DEFAULT, [])).toEqual(DEFAULT);
  });

  it("applies a stored permutation of the existing tabs", () => {
    expect(mergeTabOrder(DEFAULT, [CYCLE_TAB_KEY, "c", "a", "b"])).toEqual([
      CYCLE_TAB_KEY,
      "c",
      "a",
      "b",
    ]);
  });

  it("lets the Cycle pill be reordered like any other tab", () => {
    // Cycle dragged to the front, then the views.
    expect(mergeTabOrder(DEFAULT, [CYCLE_TAB_KEY, "a", "b", "c"])[0]).toBe(
      CYCLE_TAB_KEY
    );
  });

  it("inserts a newly created view among the views, before Cycle", () => {
    // "d" is new (absent from the stored order); its default neighbour is "c".
    const stored = ["b", "a", "c", CYCLE_TAB_KEY];
    const withNew = ["a", "b", "c", "d", CYCLE_TAB_KEY];
    expect(mergeTabOrder(withNew, stored)).toEqual([
      "b",
      "a",
      "c",
      "d",
      CYCLE_TAB_KEY,
    ]);
  });

  it("inserts a new leading view before the following placed tab", () => {
    // "z" is new and sorts first in the default order.
    const stored = ["a", "b"];
    expect(mergeTabOrder(["z", "a", "b"], stored)).toEqual(["z", "a", "b"]);
  });

  it("drops keys that no longer exist", () => {
    // "b" was deleted; the stored order still references it.
    const stored = ["c", "b", "a", CYCLE_TAB_KEY];
    expect(mergeTabOrder(["a", "c", CYCLE_TAB_KEY], stored)).toEqual([
      "c",
      "a",
      CYCLE_TAB_KEY,
    ]);
  });

  it("handles a strip with no Cycle tab", () => {
    expect(mergeTabOrder(["a", "b"], ["b", "a"])).toEqual(["b", "a"]);
  });
});
