import { describe, expect, it } from "vitest";
import { deepLinkNeedsAllFilter } from "./sidebar-deep-link";

type Item = { id: string; state: "open" | "closed" };

const isTarget = (item: Item) => item.id === "target";
const isOpen = (item: Item) => item.state === "open";

describe("secondary sidebar deep links", () => {
  it("keeps the current filter when the selected item is already visible", () => {
    expect(
      deepLinkNeedsAllFilter([{ id: "target", state: "open" }], isTarget, isOpen),
    ).toBe(false);
  });

  it("widens the filter when the selected item is excluded", () => {
    expect(
      deepLinkNeedsAllFilter([{ id: "target", state: "closed" }], isTarget, isOpen),
    ).toBe(true);
  });

  it("waits for a missing selected item instead of changing the filter", () => {
    expect(deepLinkNeedsAllFilter([], isTarget, isOpen)).toBe(false);
  });
});
